// Provedor de IA trocável (ADR-001, ADR-012 item 6): GeminiProvider (Google) e LocalProvider (modelo na rede da
// empresa, como o MiniCPM5). Os dois seguem a mesma interface; a pré-escala e a classificação não mudam.
import type { Certainty, ProposalBatch } from '@cronograma/core';
import type { Clock } from '../clock.ts';

export type { ProposalBatch };

export interface ClassifyRequest {
  items: { id: string; title: string }[];
  types: { code: string; name: string }[];
}

export type ClassifyAnswer = { id: string; type: string | null; certainty: Certainty }[];
export type ProposalAnswer = { slot: string; person: string | null; reason: string }[];

export interface AiProvider {
  readonly id: 'gemini' | 'local';
  /** Vagas por chamada da pré-escala; sem valor, BATCH_SIZE. Modelo pequeno pede lotes menores. */
  readonly batchSize?: number;
  testKey(key: string): Promise<{ ok: true } | { ok: false; reason: 'invalid_key' | 'unavailable' }>;
  classify(req: ClassifyRequest): Promise<ClassifyAnswer>;
  propose(req: ProposalBatch): Promise<ProposalAnswer>;
}

export class AiError extends Error {
  constructor(
    public kind: 'quota' | 'unavailable' | 'invalid_response' | 'invalid_key',
    msg: string,
  ) {
    super(msg);
    this.name = 'AiError';
  }
}

export interface ProviderOptions {
  provider: string;
  model: string;
  key: string;
  /** Endereço do servidor do modelo local (só para provider 'local'). */
  url?: string;
}

export type ProviderFactory = (opts: ProviderOptions) => AiProvider;

/** No máximo 1 chamada a cada 12 s (ADR-012 item 7). */
export const AI_MIN_INTERVAL_MS = 12_000;

/** Espaça as chamadas ao provedor: cada uma começa pelo menos `minMs` depois do início da anterior. */
export class CallSpacer {
  private last: number | null = null;

  constructor(
    private clock: Clock,
    private minMs = AI_MIN_INTERVAL_MS,
  ) {}

  async wait(): Promise<void> {
    if (this.last !== null) {
      const due = this.last + this.minMs - this.clock.now().getTime();
      if (due > 0) await this.clock.sleep(due);
    }
    this.last = this.clock.now().getTime();
  }
}

/** O mesmo provedor com as chamadas de classificação e proposta espaçadas. */
export function paced(provider: AiProvider, spacer: CallSpacer): AiProvider {
  return {
    id: provider.id,
    ...(provider.batchSize ? { batchSize: provider.batchSize } : {}),
    testKey: (key) => provider.testKey(key),
    classify: async (req) => {
      await spacer.wait();
      return provider.classify(req);
    },
    propose: async (req) => {
      await spacer.wait();
      return provider.propose(req);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Validação das respostas: o que não segue o formato é AiError('invalid_response').

const CERTAINTIES = new Set<Certainty>(['alta', 'media', 'baixa']);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A lista da resposta, venha solta ou embrulhada em { items }. */
function listOf(x: unknown): unknown[] | null {
  if (Array.isArray(x)) return x;
  if (isObj(x) && Array.isArray(x.items)) return x.items;
  return null;
}

/**
 * Vagas da resposta. Item fora do formato fica de fora (a vaga dele sai "sem proposta" na conferência), em vez de
 * derrubar o lote inteiro: com lotes grandes, uma linha torta jogava fora as outras. Só é resposta inválida quando
 * não há lista ou nenhum item presta.
 */
export function parseProposalAnswer(x: unknown): ProposalAnswer {
  const list = listOf(x);
  if (!list) throw new AiError('invalid_response', 'A IA não devolveu uma lista de vagas.');
  const out: ProposalAnswer = [];
  for (const it of list) {
    if (!isObj(it) || typeof it.slot !== 'string') continue;
    const person = typeof it.person === 'string' && it.person.trim() !== '' ? it.person.trim() : null;
    if (it.person !== null && it.person !== undefined && typeof it.person !== 'string') continue;
    out.push({ slot: it.slot, person, reason: typeof it.reason === 'string' ? it.reason : '' });
  }
  if (list.length > 0 && out.length === 0) throw new AiError('invalid_response', 'Resposta da IA fora do formato { slot, person, reason }.');
  return out;
}

/** Eventos da resposta; como na proposta, item fora do formato fica de fora e o evento segue "a definir". */
export function parseClassifyAnswer(x: unknown): ClassifyAnswer {
  const list = listOf(x);
  if (!list) throw new AiError('invalid_response', 'A IA não devolveu uma lista de eventos.');
  const out: ClassifyAnswer = [];
  for (const it of list) {
    if (
      !isObj(it) || typeof it.id !== 'string' || !(typeof it.type === 'string' || it.type === null) ||
      typeof it.certainty !== 'string' || !CERTAINTIES.has(it.certainty as Certainty)
    ) {
      continue;
    }
    out.push({ id: it.id, type: it.type, certainty: it.certainty as Certainty });
  }
  if (list.length > 0 && out.length === 0) throw new AiError('invalid_response', 'Resposta da IA fora do formato { id, type, certainty }.');
  return out;
}
