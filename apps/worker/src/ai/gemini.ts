// GeminiProvider (ADR-012): @google/genai com saída em JSON Schema, uma nova tentativa em 429 depois do tempo
// pedido pelo Google e nada além de códigos, horários, cargas e títulos de evento no que é enviado.
import { ApiError, GoogleGenAI } from '@google/genai';
import type { Clock } from '../clock.ts';
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

/** Espera quando o 429 não diz quanto esperar. */
export const DEFAULT_RETRY_MS = 30_000;

const PROPOSE_INSTRUCTION = [
  'Você monta a pré-escala de uma equipe de audiovisual.',
  'Recebe vagas (slot) com função (role), tipo de serviço (type), horário e até 5 candidatos já conferidos:',
  'todos têm a função, estão sem ausência e cabem no limite de horas. Pessoas, funções e tipos vêm só como códigos.',
  'Escolha um candidato por vaga, ou null se nenhum servir. Prefira quem tem mais histórico (hist) naquela função',
  'e tipo; em empate próximo (inTieGroup), quem tem menos carga (loadHours, depois loadCount).',
  'Não ponha a mesma pessoa em vagas com horários sobrepostos e não passe do limitHours somando as horas escolhidas.',
  'Para cada vaga, devolva { slot, person, reason }, com reason curta em português (até 80 caracteres),',
  'por exemplo "costuma fazer T1; 12 h na semana". Use só os códigos recebidos.',
].join(' ');

const CLASSIFY_INSTRUCTION = [
  'Classifique cada evento da agenda de uma equipe de audiovisual em um dos tipos de serviço dados, pelo título.',
  'Devolva { id, type, certainty } para cada item: type é o código do tipo (por exemplo T1) ou null quando nenhum',
  'serve; certainty é "media" quando o título deixa claro e "baixa" quando é um palpite.',
].join(' ');

const PROPOSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      slot: { type: 'string' },
      person: { type: ['string', 'null'] },
      reason: { type: 'string' },
    },
    required: ['slot', 'person', 'reason'],
  },
};

const CLASSIFY_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: ['string', 'null'] },
      certainty: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    },
    required: ['id', 'type', 'certainty'],
  },
};

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: { '@type'?: string; reason?: string; retryDelay?: string }[] };
}

function errorBody(e: ApiError): GoogleErrorBody {
  try {
    return JSON.parse(e.message) as GoogleErrorBody;
  } catch {
    return {};
  }
}

/** retryDelay do RetryInfo ("20s", "1.5s") em milissegundos. */
export function retryDelayMs(e: ApiError): number | null {
  for (const d of errorBody(e).error?.details ?? []) {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay ?? '');
    if (m) return Math.ceil(Number(m[1]) * 1000);
  }
  return null;
}

export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof ApiError) {
    const body = errorBody(e).error;
    const text = JSON.stringify(body ?? {});
    if (e.status === 429) return new AiError('quota', 'Limite do plano gratuito da IA atingido.');
    if (e.status === 401 || e.status === 403 || (e.status === 400 && /API_KEY_INVALID|API key not valid/i.test(text))) {
      return new AiError('invalid_key', 'Chave recusada pelo fornecedor.');
    }
    if (e.status >= 500) return new AiError('unavailable', `A IA está fora do ar (${e.status}).`);
    return new AiError('invalid_response', body?.message ?? `A IA recusou o pedido (${e.status}).`);
  }
  return new AiError('unavailable', `Sem conexão com a IA: ${e instanceof Error ? e.message : String(e)}`);
}

export class GeminiProvider implements AiProvider {
  readonly id = 'gemini' as const;

  constructor(
    private opts: { key: string; model: string; clock: Clock },
  ) {}

  private client(key = this.opts.key) {
    return new GoogleGenAI({ apiKey: key });
  }

  async testKey(key: string): Promise<{ ok: true } | { ok: false; reason: 'invalid_key' | 'unavailable' }> {
    try {
      await this.client(key).models.get({ model: this.opts.model });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: toAiError(e).kind === 'invalid_key' ? 'invalid_key' : 'unavailable' };
    }
  }

  async classify(req: ClassifyRequest): Promise<ClassifyAnswer> {
    return parseClassifyAnswer(await this.generate(CLASSIFY_INSTRUCTION, req, CLASSIFY_SCHEMA));
  }

  async propose(req: ProposalBatch): Promise<ProposalAnswer> {
    return parseProposalAnswer(await this.generate(PROPOSE_INSTRUCTION, { slots: req.slots, people: req.people }, PROPOSE_SCHEMA));
  }

  /** Uma chamada; em 429 espera o retryDelay pedido e tenta mais uma vez, depois desiste com 'quota'. */
  private async generate(instruction: string, payload: unknown, schema: object): Promise<unknown> {
    const ai = this.client();
    for (let attempt = 0; ; attempt++) {
      let text: string | undefined;
      try {
        const res = await ai.models.generateContent({
          model: this.opts.model,
          contents: JSON.stringify(payload),
          config: {
            systemInstruction: instruction,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            temperature: 0.2,
          },
        });
        text = res.text;
      } catch (e) {
        const err = toAiError(e);
        if (err.kind === 'quota' && attempt === 0 && e instanceof ApiError) {
          await this.opts.clock.sleep(retryDelayMs(e) ?? DEFAULT_RETRY_MS);
          continue;
        }
        throw err;
      }
      try {
        return JSON.parse(text ?? '');
      } catch {
        throw new AiError('invalid_response', 'A IA devolveu um texto que não é JSON.');
      }
    }
  }
}

export const geminiFactory = (clock: Clock) => (opts: { model: string; key: string }) =>
  new GeminiProvider({ key: opts.key, model: opts.model, clock });
