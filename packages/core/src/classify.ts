// Classificação do tipo de serviço pelo título (ADR-012 item 5) e possíveis duplicados (US-010 EC-3).
import { nameTokens } from './names.ts';
import type { Certainty, EventOrigin } from './types.ts';

export interface ServiceTypeLike {
  id: string;
  code: string;
  keywords: string[];
  archived?: boolean;
}

/** Títulos do histórico com o tipo que tiveram. */
export type TitleIndex = { title: string; serviceTypeId: string }[];

export interface Classification {
  typeId: string | null;
  type: string | null; // código T..
  certainty: Certainty;
  source: 'keyword' | 'history' | null;
  score?: number; // Jaccard da semelhança com o histórico
}

/** Semelhança mínima de título com o histórico para certeza média. */
export const JACCARD_MIN = 0.6;

const STOPWORDS = new Set(['a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'para', 'com']);

/** Palavras do título que contam na semelhança. */
export function titleWords(title: string): Set<string> {
  return new Set(nameTokens(title).filter((t) => !STOPWORDS.has(t)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function containsPhrase(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false;
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((p, j) => words[i + j] === p)) return true;
  }
  return false;
}

/**
 * Palavra-chave do tipo dá certeza alta; senão o título mais parecido do histórico (Jaccard >= 0,6)
 * dá certeza média; senão fica "a definir" com certeza baixa, para a IA ou o administrador.
 */
export function classifyTitle(title: string, types: ServiceTypeLike[], history: TitleIndex): Classification {
  const active = types.filter((t) => !t.archived);
  const words = nameTokens(title);

  let best: { t: ServiceTypeLike; len: number } | null = null;
  let tie = false;
  for (const t of active) {
    for (const k of t.keywords) {
      const phrase = nameTokens(k);
      if (!containsPhrase(words, phrase)) continue;
      if (!best || phrase.length > best.len) {
        best = { t, len: phrase.length };
        tie = false;
      } else if (phrase.length === best.len && best.t.id !== t.id) {
        tie = true;
      }
    }
  }
  if (best && !tie) return { typeId: best.t.id, type: best.t.code, certainty: 'alta', source: 'keyword' };

  const target = titleWords(title);
  const byId = new Map(active.map((t) => [t.id, t]));
  let top: { t: ServiceTypeLike; score: number } | null = null;
  for (const h of history) {
    const t = byId.get(h.serviceTypeId);
    if (!t) continue;
    const score = jaccard(target, titleWords(h.title));
    if (!top || score > top.score) top = { t, score };
  }
  if (top && top.score >= JACCARD_MIN) {
    return { typeId: top.t.id, type: top.t.code, certainty: 'media', source: 'history', score: top.score };
  }
  return { typeId: null, type: null, certainty: 'baixa', source: null, ...(top ? { score: top.score } : {}) };
}

export interface DuplicateCandidate {
  id: string;
  origin: EventOrigin;
  calendarSourceId?: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  status?: string;
}

/**
 * Grupos de possíveis duplicados: mesmo título normalizado e mesmo horário vindos de origens
 * diferentes (duas agendas, ou agenda e evento interno). Cancelados não entram.
 */
export function detectDuplicates(events: DuplicateCandidate[]): string[][] {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const e of events) {
    if (e.status === 'cancelled') continue;
    const k = `${nameTokens(e.title).join(' ')}|${e.startsAt.getTime()}|${e.endsAt.getTime()}`;
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }
  const out: string[][] = [];
  for (const g of groups.values()) {
    const sources = new Set(g.map((e) => (e.origin === 'internal' ? 'internal' : `cal:${e.calendarSourceId ?? ''}`)));
    if (g.length > 1 && sources.size > 1) out.push(g.map((e) => e.id).sort());
  }
  return out.sort((a, b) => (a[0] as string).localeCompare(b[0] as string));
}
