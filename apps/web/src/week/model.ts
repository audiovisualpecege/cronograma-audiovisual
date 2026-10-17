// Regras de tela da semana do administrador, puras: contexto das regras do core a partir das linhas da cópia
// local, equipe estimada, falta por função, contagens de publicação e alterações não publicadas.
import {
  addDays,
  daysOf,
  demandFromSlots,
  eventHours,
  localDate,
  localTime,
  roleDemandSupply,
  type AbsenceLike,
  type AssignmentLike,
  type EventLike,
  type PersonLike,
  type RoleBalance,
  type SlotLike,
  type WeekContext,
} from '@cronograma/core';
import {
  crewOf,
  rolesOf,
  type AbsenceRow,
  type AssignmentRow,
  type CrewItem,
  type CrewRow,
  type EventRow,
  type JobRoleRow,
  type PersonRoleRow,
  type PersonRow,
  type PublishedRow,
  type ServiceTypeRow,
  type SlotRow,
  type WeekRow,
} from '../data/catalog';

export interface WeekRows {
  weekStart: string;
  week: WeekRow | null;
  events: EventRow[];
  slots: SlotRow[];
  assignments: AssignmentRow[];
  published: PublishedRow[];
  people: PersonRow[];
  personRoles: PersonRoleRow[];
  absences: AbsenceRow[];
  roles: JobRoleRow[];
  types: ServiceTypeRow[];
  crew: CrewRow[];
}

export type SlotState = 'open' | 'proposed' | 'confirmed';

export function slotState(a: AssignmentRow | undefined): SlotState {
  if (!a?.person_id || !a.status) return 'open';
  return a.status;
}

const WEEKDAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** Os sete dias da semana, de segunda a domingo. */
export function weekDays(weekStart: string): { date: string; label: string; short: string }[] {
  return WEEKDAYS.map((name, i) => {
    const date = addDays(weekStart, i);
    const [, m, d] = date.split('-');
    return { date, label: `${name}, ${d}/${m}`, short: `${name.slice(0, 3)} ${d}/${m}` };
  });
}

/** "dd/mm" de uma data de calendário. */
export function dayMonth(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Horário do evento em texto: "14:00 às 17:00", "dia inteiro" ou com a data de fim quando atravessa dias. */
export function eventSpan(e: Pick<EventRow, 'starts_at' | 'ends_at' | 'all_day'>): string {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  if (e.all_day) return 'dia inteiro';
  const sameDay = localDate(start) === localDate(new Date(end.getTime() - 1));
  return sameDay ? `${localTime(start)} às ${localTime(end)}` : `${localTime(start)} às ${dayMonth(localDate(end))} ${localTime(end)}`;
}

export function typeNoTeam(types: readonly ServiceTypeRow[], typeId: string | null | undefined): boolean {
  return Boolean(typeId && types.find((t) => t.id === typeId)?.no_team);
}

/** Evento que entra na escala: ativo, não ignorado e que exige equipe. */
export function needsTeam(e: EventRow, types: readonly ServiceTypeRow[]): boolean {
  return e.status !== 'cancelled' && !e.ignored && !e.no_team && !typeNoTeam(types, e.service_type_id);
}

export function toEventLike(e: EventRow, types: readonly ServiceTypeRow[]): EventLike {
  return {
    id: e.id,
    weekStart: e.week_start,
    startsAt: new Date(e.starts_at),
    endsAt: new Date(e.ends_at),
    allDay: Boolean(e.all_day),
    periodStart: e.period_start ? new Date(e.period_start) : null,
    periodEnd: e.period_end ? new Date(e.period_end) : null,
    status: e.status as EventLike['status'],
    serviceTypeId: e.service_type_id ?? null,
    noTeam: Boolean(e.no_team) || typeNoTeam(types, e.service_type_id),
    title: e.title,
  };
}

export function toPersonLike(p: PersonRow, personRoles: readonly PersonRoleRow[]): PersonLike {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    active: p.active,
    weeklyLimitHours: Number(p.weekly_limit_hours),
    roleIds: rolesOf(p, personRoles),
  };
}

export function toAbsenceLike(a: AbsenceRow): AbsenceLike {
  return { personId: a.person_id, startsAt: new Date(a.starts_at), endsAt: new Date(a.ends_at), archived: Boolean(a.archived_at) };
}

/** Vagas ativas de eventos da semana, em ordem cronológica, com códigos V1, V2... */
export function activeSlots(rows: Pick<WeekRows, 'events' | 'slots'>): SlotRow[] {
  const start = new Map(rows.events.filter((e) => !e.ignored).map((e) => [e.id, e.starts_at]));
  return rows.slots
    .filter((s) => !s.archived_at && start.has(s.event_id))
    .sort((a, b) => (start.get(a.event_id) as string).localeCompare(start.get(b.event_id) as string) || a.id.localeCompare(b.id));
}

/** Contexto das regras do core (aptidão, carga, ranking) com o que está na cópia local. */
export function weekContext(rows: WeekRows, now: Date): WeekContext {
  const events = rows.events.filter((e) => !e.ignored).map((e) => toEventLike(e, rows.types));
  const slots: SlotLike[] = activeSlots(rows).map((s, i) => ({ id: s.id, code: `V${i + 1}`, eventId: s.event_id, jobRoleId: s.job_role_id }));
  const slotIds = new Set(slots.map((s) => s.id));
  const assignments: AssignmentLike[] = rows.assignments
    .filter((a) => a.person_id && a.status && slotIds.has(a.slot_id))
    .map((a) => ({ slotId: a.slot_id, eventId: a.event_id, personId: a.person_id as string, status: a.status as AssignmentLike['status'], locked: Boolean(a.locked) }));
  return {
    weekStart: rows.weekStart,
    now,
    people: rows.people.map((p) => toPersonLike(p, rows.personRoles)),
    events,
    slots,
    assignments,
    absences: rows.absences.map(toAbsenceLike),
    jobRoles: rows.roles.map((r) => ({ id: r.id, code: r.code })),
    serviceTypes: rows.types.map((t) => ({ id: t.id, code: t.code })),
  };
}

/** Equipe estimada do evento pelo tipo; vazia sem tipo, para tipo sem equipe ou evento que não exige equipe. */
export function estimatedCrew(e: EventRow, types: readonly ServiceTypeRow[], crew: readonly CrewRow[]): CrewItem[] {
  if (!e.service_type_id || e.no_team || e.status === 'cancelled' || e.ignored) return [];
  const type = types.find((t) => t.id === e.service_type_id);
  if (!type || type.no_team) return [];
  return crewOf(type, crew);
}

/**
 * Pedido e oferta de horas por função (US-010 AC-3): na prévia, pela equipe estimada dos tipos; com a
 * semana montada, pelas vagas ativas.
 */
export function roleBalance(rows: WeekRows, mode: 'preview' | 'built'): RoleBalance[] {
  const events = rows.events.filter((e) => !e.ignored).map((e) => toEventLike(e, rows.types));
  let demand: { jobRoleId: string; hours: number }[];
  if (mode === 'built') {
    demand = demandFromSlots(events, activeSlots(rows).map((s, i) => ({ id: s.id, code: `V${i + 1}`, eventId: s.event_id, jobRoleId: s.job_role_id })));
  } else {
    demand = rows.events.flatMap((e) => {
      const hours = eventHours(toEventLike(e, rows.types));
      return estimatedCrew(e, rows.types, rows.crew).flatMap((c) => Array.from({ length: c.quantity }, () => ({ jobRoleId: c.job_role_id, hours })));
    });
  }
  const balance = roleDemandSupply({
    weekStart: rows.weekStart,
    demand,
    people: rows.people.map((p) => toPersonLike(p, rows.personRoles)),
    absences: rows.absences.map(toAbsenceLike),
  });
  // Só as funções pedidas na semana; as demais não ajudam a decidir.
  return balance.filter((b) => b.demandHours > 0);
}

/** Eventos de cada dia da semana; evento de vários dias aparece em cada dia que ocupa (US-010 EC-4). */
export function eventsByDay(weekStart: string, events: readonly EventRow[]): Map<string, EventRow[]> {
  const days = new Map(weekDays(weekStart).map((d) => [d.date, [] as EventRow[]]));
  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title, 'pt-BR'));
  for (const e of sorted) {
    for (const day of daysOf({ startsAt: new Date(e.starts_at), endsAt: new Date(e.ends_at) })) days.get(day)?.push(e);
  }
  return days;
}

export interface PublishSummary {
  /** Vagas sem ninguém (nem proposta). */
  open: number;
  proposed: number;
  alerts: number;
  filled: number;
}

/** O que vai e o que não vai para a equipe ao publicar (US-017 AC-1, US-014 EC-3). */
export function publishSummary(rows: WeekRows): PublishSummary {
  const team = new Set(rows.events.filter((e) => needsTeam(e, rows.types)).map((e) => e.id));
  const bySlot = new Map(rows.assignments.map((a) => [a.slot_id, a]));
  const out: PublishSummary = { open: 0, proposed: 0, alerts: 0, filled: 0 };
  for (const s of activeSlots(rows)) {
    if (!team.has(s.event_id)) continue;
    const a = bySlot.get(s.id);
    const state = slotState(a);
    if (state === 'confirmed') {
      out.filled += 1;
      if ((a?.warnings ?? []).some((w) => w !== 'role_archived')) out.alerts += 1;
    } else if (state === 'proposed') {
      out.proposed += 1;
    } else {
      out.open += 1;
    }
  }
  return out;
}

/**
 * Alterações não publicadas (US-018 AC-1): diferenças entre a escala atual e a fotografia corrente, pela
 * mesma regra do descarte: vaga que mudou de pessoa, saiu ou entrou, e observação que mudou.
 */
export function unpublishedChanges(rows: WeekRows): number {
  const week = rows.week;
  if (!week || week.state !== 'published') return 0;
  const snapshot = rows.published.filter((p) => p.week_id === week.id && p.revision === week.revision);
  const bySlot = new Map(rows.assignments.map((a) => [a.slot_id, a]));
  const slotsById = new Map(rows.slots.map((s) => [s.id, s]));
  const events = new Map(rows.events.map((e) => [e.id, e]));
  const inSnapshot = new Set(snapshot.map((p) => p.slot_id));
  const publishedEvents = new Set(snapshot.map((p) => p.event_id));
  const confirmed = (slotId: string) => {
    const a = bySlot.get(slotId);
    return slotState(a) === 'confirmed' ? (a?.person_id ?? null) : null;
  };
  let n = 0;
  for (const p of snapshot) {
    const s = p.slot_id ? slotsById.get(p.slot_id) : undefined;
    const e = events.get(p.event_id);
    if (!s || s.archived_at || !e || !needsTeam(e, rows.types)) n += 1;
    else if (confirmed(s.id) !== p.person_id) n += 1;
  }
  for (const s of activeSlots(rows)) {
    if (inSnapshot.has(s.id)) continue;
    const e = events.get(s.event_id);
    if (!e || !needsTeam(e, rows.types)) continue;
    if (publishedEvents.has(s.event_id) || confirmed(s.id)) n += 1;
  }
  const notes = new Map(snapshot.map((p) => [p.event_id, p.notes ?? null]));
  for (const [eventId, published] of notes) {
    if ((events.get(eventId)?.notes ?? null) !== published) n += 1;
  }
  return n;
}

export interface PersonLoadRow {
  personId: string;
  name: string;
  hours: number;
  count: number;
  limit: number;
  over: boolean;
}

/** Carga da semana de cada pessoa ativa (US-014 AC-4), de quem tem mais horas para quem tem menos. */
export function loadRows(rows: WeekRows, ctx: WeekContext): PersonLoadRow[] {
  const events = new Map(ctx.events.map((e) => [e.id, e]));
  const acc = new Map<string, { hours: number; seen: Set<string> }>();
  for (const a of ctx.assignments) {
    const e = events.get(a.eventId);
    if (!e || e.status === 'cancelled' || e.weekStart !== ctx.weekStart) continue;
    const cur = acc.get(a.personId) ?? { hours: 0, seen: new Set<string>() };
    if (!cur.seen.has(e.id)) {
      cur.seen.add(e.id);
      cur.hours += eventHours(e);
    }
    acc.set(a.personId, cur);
  }
  return rows.people
    .filter((p) => p.active)
    .map((p) => {
      const cur = acc.get(p.id);
      const hours = cur?.hours ?? 0;
      const limit = Number(p.weekly_limit_hours);
      return { personId: p.id, name: p.name, hours, count: cur?.seen.size ?? 0, limit, over: hours > limit };
    })
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Horas em texto: "12 h" ou "2,5 h". */
export function hoursText(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`;
}

export function activitiesText(n: number): string {
  return n === 1 ? '1 atividade' : `${n} atividades`;
}

export const WARNING_LABEL: Record<string, string> = {
  overlap: 'horário sobreposto',
  absent: 'pessoa ausente',
  over_limit: 'passa do limite semanal',
  role_not_enabled: 'função não habilitada',
  role_archived: 'função arquivada',
};

export const BLOCKER_LABEL: Record<string, string> = {
  person_inactive: 'pessoa inativa',
  event_cancelled: 'evento cancelado',
  same_event_twice: 'já está neste evento',
  week_past: 'semana passada',
};

export const CERTAINTY_LABEL = { alta: 'certeza alta', media: 'certeza média', baixa: 'certeza baixa' } as const;

