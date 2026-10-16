// Padrões do histórico (US-008), sugestões de cadastro (US-004 EC-2, US-005 EC-5),
// falta por função na prévia (US-010 AC-3) e junção de ausências na exibição (US-006 EC-2).
import { normalizeName } from './names.ts';
import { eventHours } from './scheduling.ts';
import { addDays, hoursBetween, zonedTime } from './time.ts';
import type { AbsenceLike, EventLike, HistoryFact, Interval, Period, PersonLike, SlotLike } from './types.ts';

/** Tipo com menos eventos que isso no histórico mostra "pouco histórico". */
export const LOW_HISTORY_EVENTS = 3;

export function inPeriod(date: string, period: Period = {}): boolean {
  return (!period.from || date >= period.from) && (!period.to || date <= period.to);
}

function filterFacts(facts: HistoryFact[], period?: Period): HistoryFact[] {
  return period ? facts.filter((f) => inPeriod(f.eventDate, period)) : facts;
}

function topCounts<K>(counts: Map<K, number>, limit: number): { key: K; count: number }[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
    .slice(0, limit);
}

function bump<K>(m: Map<K, number>, k: K, by = 1) {
  m.set(k, (m.get(k) ?? 0) + by);
}

/**
 * Equipe típica do tipo: para cada função, a quantidade por evento mais comum entre os eventos
 * que tiveram a função; no empate vale a maior.
 */
export function suggestCrew(facts: HistoryFact[], serviceTypeId: string): { jobRoleId: string; quantity: number }[] {
  const perEvent = new Map<string, Map<string, number>>(); // role -> event -> qtd
  for (const f of facts) {
    if (f.serviceTypeId !== serviceTypeId || !f.jobRoleId) continue;
    let m = perEvent.get(f.jobRoleId);
    if (!m) perEvent.set(f.jobRoleId, (m = new Map()));
    bump(m, f.eventId);
  }
  const out: { jobRoleId: string; quantity: number }[] = [];
  for (const [jobRoleId, events] of perEvent) {
    const freq = new Map<number, number>();
    for (const q of events.values()) bump(freq, q);
    const [quantity] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] as [number, number];
    out.push({ jobRoleId, quantity });
  }
  return out.sort((a, b) => a.jobRoleId.localeCompare(b.jobRoleId));
}

export interface TypeStats {
  serviceTypeId: string;
  events: number;
  lowHistory: boolean;
  crew: { jobRoleId: string; quantity: number }[];
  topPeople: { jobRoleId: string; people: { personId: string; count: number }[] }[];
}

/** Por tipo: quantos eventos, equipe típica e quem mais fez cada função, no período escolhido. */
export function typeStats(facts: HistoryFact[], period?: Period, topLimit = 3): TypeStats[] {
  const scoped = filterFacts(facts, period);
  const byType = new Map<string, HistoryFact[]>();
  for (const f of scoped) {
    if (!f.serviceTypeId) continue;
    const list = byType.get(f.serviceTypeId);
    if (list) list.push(f);
    else byType.set(f.serviceTypeId, [f]);
  }
  const out: TypeStats[] = [];
  for (const [serviceTypeId, list] of byType) {
    const events = new Set(list.map((f) => f.eventId)).size;
    const roles = new Map<string, Map<string, number>>();
    for (const f of list) {
      if (!f.jobRoleId || !f.personId) continue;
      let m = roles.get(f.jobRoleId);
      if (!m) roles.set(f.jobRoleId, (m = new Map()));
      bump(m, f.personId);
    }
    out.push({
      serviceTypeId,
      events,
      lowHistory: events < LOW_HISTORY_EVENTS,
      crew: suggestCrew(list, serviceTypeId),
      topPeople: [...roles.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([jobRoleId, m]) => ({
          jobRoleId,
          people: topCounts(m, topLimit).map(({ key, count }) => ({ personId: key, count })),
        })),
    });
  }
  return out.sort((a, b) => b.events - a.events || a.serviceTypeId.localeCompare(b.serviceTypeId));
}

export interface PersonPatterns {
  personId: string;
  types: { serviceTypeId: string; count: number }[];
  roles: { jobRoleId: string; count: number }[];
  weeks: number;
  avgWeeklyHours: number;
  avgWeeklyCount: number;
}

/**
 * Tipos e funções que a pessoa mais fez e a carga média nas semanas em que trabalhou
 * (horas por evento contadas uma vez, mesmo com duas funções).
 */
export function personPatterns(personId: string, facts: HistoryFact[], period?: Period, limit = 3): PersonPatterns {
  const mine = filterFacts(facts, period).filter((f) => f.personId === personId);
  const types = new Map<string, number>();
  const roles = new Map<string, number>();
  const events = new Map<string, HistoryFact>();
  for (const f of mine) {
    if (f.serviceTypeId) bump(types, f.serviceTypeId);
    if (f.jobRoleId) bump(roles, f.jobRoleId);
    events.set(f.eventId, f);
  }
  const weeks = new Set([...events.values()].map((f) => f.weekStart)).size;
  const hours = [...events.values()].reduce((s, f) => s + f.hours, 0);
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    personId,
    types: topCounts(types, limit).map(({ key, count }) => ({ serviceTypeId: key, count })),
    roles: topCounts(roles, limit).map(({ key, count }) => ({ jobRoleId: key, count })),
    weeks,
    avgWeeklyHours: weeks ? round(hours / weeks) : 0,
    avgWeeklyCount: weeks ? round(events.size / weeks) : 0,
  };
}

export interface RoleBalance {
  jobRoleId: string;
  demandHours: number;
  supplyHours: number;
  shortHours: number;
  short: boolean;
}

/** Horas pedidas por função a partir das vagas da semana (eventos ativos e com equipe). */
export function demandFromSlots(events: EventLike[], slots: SlotLike[]): { jobRoleId: string; hours: number }[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  return slots.flatMap((s) => {
    const e = byId.get(s.eventId);
    if (!e || s.archived || e.status === 'cancelled' || e.noTeam) return [];
    return [{ jobRoleId: s.jobRoleId, hours: eventHours(e) }];
  });
}

/**
 * Horas que a pessoa tem na semana: o limite semanal menos as ausências. Cada dia vale no máximo
 * um quinto do limite, então um dia inteiro de folga tira um dia de trabalho, não 24 horas.
 */
export function availableHours(person: PersonLike, absences: AbsenceLike[], weekStart: string): number {
  const dailyCap = person.weeklyLimitHours / 5;
  let absent = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const dayIv: Interval = { start: zonedTime(day), end: zonedTime(addDays(day, 1)) };
    let h = 0;
    for (const a of absences) {
      if (a.personId !== person.id || a.archived) continue;
      const s = Math.max(a.startsAt.getTime(), dayIv.start.getTime());
      const e = Math.min(a.endsAt.getTime(), dayIv.end.getTime());
      if (e > s) h += hoursBetween(new Date(s), new Date(e));
    }
    absent += Math.min(h, dailyCap);
  }
  return Math.max(0, person.weeklyLimitHours - absent);
}

/**
 * Pedido e oferta de horas por função na semana: a oferta soma as horas disponíveis das pessoas
 * ativas com a função (cada pessoa conta em todas as suas funções). Falta quando o pedido passa.
 */
export function roleDemandSupply(input: {
  weekStart: string;
  demand: { jobRoleId: string; hours: number }[];
  people: PersonLike[];
  absences: AbsenceLike[];
}): RoleBalance[] {
  const demand = new Map<string, number>();
  for (const d of input.demand) bump(demand, d.jobRoleId, d.hours);
  const supply = new Map<string, number>();
  for (const p of input.people) {
    if (!p.active) continue;
    const h = availableHours(p, input.absences, input.weekStart);
    for (const r of p.roleIds) bump(supply, r, h);
  }
  const roles = [...new Set([...demand.keys(), ...supply.keys()])].sort();
  return roles.map((jobRoleId) => {
    const demandHours = demand.get(jobRoleId) ?? 0;
    const supplyHours = supply.get(jobRoleId) ?? 0;
    const shortHours = Math.max(0, demandHours - supplyHours);
    return { jobRoleId, demandHours, supplyHours, shortHours, short: shortHours > 0 };
  });
}

/**
 * Nomes de funções e tipos vistos no histórico que ainda não estão no cadastro (comparação
 * normalizada), dos mais frequentes para os menos.
 */
export function suggestCatalogFromHistory(
  history: { roles: string[]; types: string[] },
  catalog: { roles: string[]; types: string[] },
): { roles: string[]; types: string[] } {
  const suggest = (seen: string[], existing: string[]) => {
    const have = new Set(existing.map(normalizeName));
    const counts = new Map<string, { label: string; count: number; first: number }>();
    seen.forEach((raw, i) => {
      const label = raw.trim().replace(/\s+/g, ' ');
      const k = normalizeName(label);
      if (!k || have.has(k)) return;
      const c = counts.get(k);
      if (c) c.count++;
      else counts.set(k, { label, count: 1, first: i });
    });
    return [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((c) => c.label);
  };
  return { roles: suggest(history.roles, catalog.roles), types: suggest(history.types, catalog.types) };
}

/** Junta ausências sobrepostas ou encostadas da mesma pessoa num período contínuo. */
export function mergeAbsences<T extends Pick<AbsenceLike, 'personId' | 'startsAt' | 'endsAt' | 'archived'>>(
  absences: T[],
): { personId: string; startsAt: Date; endsAt: Date }[] {
  const sorted = absences
    .filter((a) => !a.archived)
    .sort((a, b) => a.personId.localeCompare(b.personId) || a.startsAt.getTime() - b.startsAt.getTime());
  const out: { personId: string; startsAt: Date; endsAt: Date }[] = [];
  for (const a of sorted) {
    const last = out[out.length - 1];
    if (last && last.personId === a.personId && a.startsAt.getTime() <= last.endsAt.getTime()) {
      if (a.endsAt.getTime() > last.endsAt.getTime()) last.endsAt = a.endsAt;
    } else {
      out.push({ personId: a.personId, startsAt: a.startsAt, endsAt: a.endsAt });
    }
  }
  return out;
}
