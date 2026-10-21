// Regras de tela da semana do administrador, puras: contexto das regras do core a partir das linhas da cópia
// local, equipe estimada, pessoas disponíveis por função, contagens de publicação e alterações não publicadas.
import {
  addDays,
  availableHours,
  daysOf,
  localDate,
  localTime,
  type AbsenceLike,
  type AssignmentLike,
  type EventLike,
  type HistoryFact,
  type PersonLike,
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

export interface RoleAvailability {
  jobRoleId: string;
  name: string;
  people: number;
}

/**
 * Pessoas disponíveis na semana por função: ativas e com horas livres depois das ausências. Quem tem
 * mais de uma função conta uma vez só, na que mais fez no histórico; sem histórico (ou empate), na
 * primeira pelo código da função. Da função com mais gente para a com menos.
 */
export function availabilityByRole(rows: WeekRows, facts: readonly Pick<HistoryFact, 'personId' | 'jobRoleId'>[]): RoleAvailability[] {
  const done = new Map<string, number>();
  for (const f of facts) {
    if (f.personId && f.jobRoleId) done.set(`${f.personId}|${f.jobRoleId}`, (done.get(`${f.personId}|${f.jobRoleId}`) ?? 0) + 1);
  }
  const roles = new Map(rows.roles.filter((r) => !r.archived_at).map((r) => [r.id, r]));
  const byCode = (a: string, b: string) => (roles.get(a)?.code ?? '').localeCompare(roles.get(b)?.code ?? '', 'en', { numeric: true });
  const absences = rows.absences.map(toAbsenceLike);
  const count = new Map<string, number>();
  for (const p of rows.people) {
    if (!p.active) continue;
    const person = toPersonLike(p, rows.personRoles);
    const enabled = person.roleIds.filter((r) => roles.has(r)).sort(byCode);
    if (enabled.length === 0 || availableHours(person, absences, rows.weekStart) <= 0) continue;
    const times = (r: string) => done.get(`${p.id}|${r}`) ?? 0;
    const main = enabled.reduce((best, r) => (times(r) > times(best) ? r : best));
    count.set(main, (count.get(main) ?? 0) + 1);
  }
  return [...count]
    .map(([jobRoleId, people]) => ({ jobRoleId, name: roles.get(jobRoleId)?.name ?? 'Função', people }))
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name, 'pt-BR'));
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

