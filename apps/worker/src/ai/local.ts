// LocalProvider: modelo rodando na rede da empresa (MiniCPM5 ou outro), por um servidor no formato da API de
// chat do OpenAI (Ollama, llama.cpp, LM Studio, vLLM: todos falam /v1/chat/completions). Mesmas instruções e
// mesmos formatos do Gemini (prompts.ts). Sem cota: não passa pelo espaçamento de 12 s entre chamadas.
import { CLASSIFY_INSTRUCTION, CLASSIFY_SCHEMA, PROPOSE_INSTRUCTION, PROPOSE_SCHEMA } from './prompts.ts';
import {
  AiError,
  parseClassifyAnswer,
  parseProposalAnswer,
  type AiProvider,
  type ClassifyAnswer,
  type ClassifyRequest,
  type ProposalAnswer,
  type ProposalBatch,
} from './provider.ts';

/** Modelo pequeno no processador do NAS pode demorar: até 10 minutos por chamada. */
export const LOCAL_TIMEOUT_MS = 10 * 60_000;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Endereço base sem a barra no fim e com /v1 (aceita http://nas:11434 ou http://nas:11434/v1). */
export function chatBase(url: string): string {
  const base = url.trim().replace(/\/+$/, '');
  return /\/v1$/.test(base) ? base : `${base}/v1`;
}

/**
 * O JSON da resposta. Modelos de raciocínio (o MiniCPM5 é um) podem escrever o pensamento em <think>...</think>
 * antes, ou cercar o JSON com ```json; tudo isso sai antes de ler.
 */
export function extractJson(text: string): unknown {
  const clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.search(/[[{]/);
    const end = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(clean.slice(start, end + 1));
      } catch {
        // cai no erro abaixo
      }
    }
    throw new AiError('invalid_response', 'A IA local devolveu um texto que não é JSON.');
  }
}

/** A lista pedida, venha solta ou embrulhada em { items } (o formato que a API exige na raiz). */
function unwrap(x: unknown): unknown {
  if (x && typeof x === 'object' && !Array.isArray(x) && Array.isArray((x as { items?: unknown }).items)) return (x as { items: unknown }).items;
  return x;
}

/**
 * Vagas por chamada no modelo local: um lote de 25 passa de 5 mil tokens, mais do que o contexto padrão do
 * Ollama (4.096) e pesado para um modelo de 2B. Com 10, cabe com folga e a resposta sai mais certa.
 */
export const LOCAL_BATCH_SIZE = 10;

export class LocalProvider implements AiProvider {
  readonly id = 'local' as const;
  readonly batchSize = LOCAL_BATCH_SIZE;

  constructor(
    private opts: { url: string; model: string; key?: string; fetch?: FetchLike; timeoutMs?: number },
  ) {}

  private headers(): Record<string, string> {
    return { 'content-type': 'application/json', ...(this.opts.key ? { authorization: `Bearer ${this.opts.key}` } : {}) };
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const doFetch = this.opts.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${chatBase(this.opts.url)}${path}`, { ...init, headers: this.headers(), signal: AbortSignal.timeout(this.opts.timeoutMs ?? LOCAL_TIMEOUT_MS) });
    } catch (e) {
      throw new AiError('unavailable', `Sem conexão com a IA local (${this.opts.url}): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status === 401 || res.status === 403) throw new AiError('invalid_key', 'O servidor da IA local recusou o acesso.');
    if (res.status === 429) throw new AiError('quota', 'O servidor da IA local está ocupado.');
    if (res.status === 404) throw new AiError('unavailable', `O servidor da IA local não tem o modelo "${this.opts.model}" ou o endereço está errado.`);
    if (res.status >= 500) throw new AiError('unavailable', `A IA local está fora do ar (${res.status}).`);
    if (!res.ok) {
      // O servidor costuma dizer o porquê (contexto curto, formato não suportado): vai junto, cortado.
      const why = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      throw new AiError('invalid_response', `A IA local recusou o pedido (${res.status})${why ? `: ${why}` : ''}.`);
    }
    return res;
  }

  /** Teste de conexão: o servidor responde e conhece o modelo configurado. */
  async testKey(): Promise<{ ok: true } | { ok: false; reason: 'invalid_key' | 'unavailable' }> {
    try {
      const res = await this.call('/models', { method: 'GET' });
      const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] };
      const ids = (body.data ?? []).map((m) => m.id ?? '');
      if (ids.length > 0 && !ids.some((id) => id === this.opts.model || id.startsWith(`${this.opts.model}:`))) return { ok: false, reason: 'unavailable' };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof AiError && e.kind === 'invalid_key' ? 'invalid_key' : 'unavailable' };
    }
  }

  async classify(req: ClassifyRequest): Promise<ClassifyAnswer> {
    return parseClassifyAnswer(await this.generate(CLASSIFY_INSTRUCTION, req, CLASSIFY_SCHEMA));
  }

  async propose(req: ProposalBatch): Promise<ProposalAnswer> {
    return parseProposalAnswer(await this.generate(PROPOSE_INSTRUCTION, { slots: req.slots, people: req.people }, PROPOSE_SCHEMA));
  }

  private async generate(instruction: string, payload: unknown, schema: object): Promise<unknown> {
    const res = await this.call('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.opts.model,
        temperature: 0.2,
        stream: false,
        messages: [
          { role: 'system', content: `${instruction} Responda só com JSON no formato { "items": [...] }, sem texto antes ou depois.` },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'resposta', schema: { type: 'object', properties: { items: schema }, required: ['items'] } },
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AiError('invalid_response', 'A IA local respondeu fora do formato da API de chat.');
    return unwrap(extractJson(text));
  }
}
