// Provedor de IA trocável (ADR-001, ADR-012 item 6). Nesta entrega só existe o GeminiProvider; outro
// fornecedor entra implementando a mesma interface, sem mudar a pré-escala nem a classificação.
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
  readonly id: 'gemini';
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

export function parseProposalAnswer(x: unknown): ProposalAnswer {
  if (!Array.isArray(x)) throw new AiError('invalid_response', 'A IA não devolveu uma lista de vagas.');
  return x.map((it) => {
    if (
      !isObj(it) || typeof it.slot !== 'string' || typeof it.reason !== 'string' ||
      !(typeof it.person === 'string' || it.person === null)
    ) {
      throw new AiError('invalid_response', 'Resposta da IA fora do formato { slot, person, reason }.');
    }
    return { slot: it.slot, person: it.person, reason: it.reason };
  });
}

export function parseClassifyAnswer(x: unknown): ClassifyAnswer {
  if (!Array.isArray(x)) throw new AiError('invalid_response', 'A IA não devolveu uma lista de eventos.');
  return x.map((it) => {
    if (
      !isObj(it) || typeof it.id !== 'string' || !(typeof it.type === 'string' || it.type === null) ||
      typeof it.certainty !== 'string' || !CERTAINTIES.has(it.certainty as Certainty)
    ) {
      throw new AiError('invalid_response', 'Resposta da IA fora do formato { id, type, certainty }.');
    }
    return { id: it.id, type: it.type, certainty: it.certainty as Certainty };
  });
}
