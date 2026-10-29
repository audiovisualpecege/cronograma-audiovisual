// Porte do evento (Simples, Médio, Grande): cada tipo com porte tem uma equipe típica por porte. Espelha
// public.event_crew_size (migração 0017). O porte sugerido vem da série do evento no histórico: quantas pessoas
// foram nas últimas vezes, e o porte cuja equipe chega mais perto disso.
import { eventSeries } from './scheduling.ts';
import type { HistoryFact } from './types.ts';

export type EventSize = 1 | 2 | 3;
export const EVENT_SIZES: readonly EventSize[] = [1, 2, 3];
export const SIZE_LABEL: Record<EventSize, string> = { 1: 'Simples', 2: 'Médio', 3: 'Grande' };
/** Porte padrão de um tipo novo com porte; cada tipo tem o seu (EVENTO Simples, GRAVACAO Médio). */
export const DEFAULT_SIZE: EventSize = 1;
/** Tipo sem porte guarda a equipe única neste porte. */
export const SINGLE_CREW_SIZE: EventSize = 2;
/** Quantas ocorrências da série contam na sugestão (as mais recentes). */
export const SIZE_SERIES_RECENT = 5;

export const isEventSize = (n: unknown): n is EventSize => n === 1 || n === 2 || n === 3;

/** Porte que vale para o evento: o escolhido; sem escolha, o padrão do tipo. Tipo sem porte usa a equipe única. */
export function effectiveSize(size: number | null | undefined, sized: boolean, defaultSize?: number | null): EventSize {
  if (!sized) return SINGLE_CREW_SIZE;
  if (isEventSize(size)) return size;
  return isEventSize(defaultSize) ? defaultSize : DEFAULT_SIZE;
}

export interface SeriesSize {
  date: string;
  people: number;
}

/** Pessoas de cada evento do histórico, agrupadas pela série do título. */
export function buildSeriesSizes(facts: readonly Pick<HistoryFact, 'eventId' | 'eventDate' | 'title' | 'personId'>[]): Map<string, SeriesSize[]> {
  const events = new Map<string, { series: string; date: string; people: Set<string> }>();
  facts.forEach((f, i) => {
    let e = events.get(f.eventId);
    if (!e) events.set(f.eventId, (e = { series: eventSeries(f.title), date: f.eventDate, people: new Set() }));
    // Nome sem pessoa reconhecida conta como uma pessoa a mais.
    e.people.add(f.personId ?? `?${i}`);
  });
  const out = new Map<string, SeriesSize[]>();
  for (const e of events.values()) {
    if (!e.series) continue;
    const list = out.get(e.series) ?? [];
    list.push({ date: e.date, people: e.people.size });
    out.set(e.series, list);
  }
  return out;
}

export interface SizeSuggestion {
  size: EventSize;
  /** Mediana de pessoas nas últimas vezes da série. */
  people: number;
  /** Quantas vezes da série entraram na conta. */
  events: number;
}

/**
 * Porte sugerido pela série do título: a mediana de pessoas nas últimas vezes (antes de `before`) e o porte
 * cuja equipe típica (total de vagas) chega mais perto; no empate, o menor. Nulo sem série no histórico.
 */
export function suggestSize(
  title: string,
  seriesSizes: ReadonlyMap<string, readonly SeriesSize[]>,
  crewTotals: Readonly<Record<EventSize, number>>,
  before?: string,
): SizeSuggestion | null {
  const series = eventSeries(title);
  const past = (seriesSizes.get(series) ?? []).filter((s) => !before || s.date < before);
  if (!series || past.length === 0) return null;
  const recent = [...past].sort((a, b) => b.date.localeCompare(a.date)).slice(0, SIZE_SERIES_RECENT);
  const sorted = recent.map((s) => s.people).sort((a, b) => a - b);
  const people = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
  const size = EVENT_SIZES.reduce((best, s) => (Math.abs(crewTotals[s] - people) < Math.abs(crewTotals[best] - people) ? s : best));
  return { size, people, events: recent.length };
}
