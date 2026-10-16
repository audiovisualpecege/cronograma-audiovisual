// Regras da semana: fuso, duração, carga, aptidão, ranking e lotes da pré-escala (ADR-002, ADR-012).
// Espelhadas nas funções SQL (tarefa 3); a tabela de casos de aptidão fica em cases/eligibility.ts.
import {
  addDays,
  hoursBetween,
  isoWeekday,
  localDate,
  overlaps,
  toLocalIso,
} from './time.ts';
import type {
  AssignmentLike,
  Blocker,
  Candidate,
  Eligibility,
  EventLike,
  HistoryFact,
  Interval,
  PersonLike,
  SlotLike,
  Warning,
  WeekContext,
} from './types.ts';

/** Segunda-feira da semana de um instante ou de uma data 'YYYY-MM-DD', em Brasília. */
export function weekStartOf(d: Date | string): string {
  const date = typeof d === 'string' ? d.slice(0, 10) : localDate(d);
  return addDays(date, 1 - isoWeekday(date));
}

/** Semana arquivada: week_start + 7 dias <= hoje (TechSpec, tabela weeks). */
export function isWeekPast(weekStart: string, now: Date): boolean {
  return addDays(weekStart, 7) <= localDate(now);
}

/** Intervalo que ocupa a pessoa; nulo para dia inteiro sem período informado. */
export function eventInterval(e: EventLike): Interval | null {
  if (e.allDay) {
    if (e.periodStart && e.periodEnd) return { start: e.periodStart, end: e.periodEnd };
    return null;
  }
  return { start: e.startsAt, end: e.endsAt };
}

/** Horas do evento; 0 para dia inteiro sem período. Conta uma vez mesmo em vários dias. */
export function eventHours(e: EventLike): number {
  const iv = eventInterval(e);
  return iv ? Math.max(0, hoursBetween(iv.start, iv.end)) : 0;
}

/** Dias de calendário que o evento ocupa; o fim é exclusivo (terminar 00:00 não ocupa o dia). */
export function daysOf(e: Pick<EventLike, 'startsAt' | 'endsAt'>): string[] {
  const first = localDate(e.startsAt);
  const lastInstant = new Date(Math.max(e.startsAt.getTime(), e.endsAt.getTime() - 1));
  const last = localDate(lastInstant);
  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return days;
}

// Intervalo usado para ausência e sobreposição: dia inteiro sem período ocupa os dias inteiros.
function busyInterval(e: EventLike): Interval {
  return eventInterval(e) ?? { start: e.startsAt, end: e.endsAt };
}

function indexBy<T, K>(items: T[], key: (t: T) => K): Map<K, T> {
  const m = new Map<K, T>();
  for (const it of items) m.set(key(it), it);
  return m;
}

function personAssignments(personId: string, ctx: WeekContext, exceptSlotId?: string) {
  const events = indexBy(ctx.events, (e) => e.id);
  const out: { a: AssignmentLike; e: EventLike }[] = [];
  for (const a of ctx.assignments) {
    if (a.personId !== personId || a.slotId === exceptSlotId) continue;
    const e = events.get(a.eventId);
    if (!e || e.status === 'cancelled') continue;
    out.push({ a, e });
  }
  return out;
}

function loadOf(personId: string, ctx: WeekContext, exceptSlotId?: string) {
  const seen = new Set<string>();
  let hours = 0;
  for (const { e } of personAssignments(personId, ctx, exceptSlotId)) {
    if (e.weekStart !== ctx.weekStart || seen.has(e.id)) continue;
    seen.add(e.id);
    hours += eventHours(e);
  }
  return { hours, count: seen.size };
}

/** Carga da semana: horas e atividades de alocações propostas e confirmadas, sem eventos cancelados. */
export function personLoad(personId: string, ctx: WeekContext): { hours: number; count: number } {
  return loadOf(personId, ctx);
}

function find<T extends { id: string }>(items: T[], id: string, what: string): T {
  const it = items.find((i) => i.id === id);
  if (!it) throw new Error(`${what} não encontrado: ${id}`);
  return it;
}

/** Aptidão de uma pessoa para uma vaga: bloqueios impedem, alertas pedem "escalar mesmo assim". */
export function checkEligibility(personId: string, slotId: string, ctx: WeekContext): Eligibility {
  const person = find(ctx.people, personId, 'pessoa');
  const slot = find(ctx.slots, slotId, 'vaga');
  const event = find(ctx.events, slot.eventId, 'evento');
  const blockers: Blocker[] = [];
  const warnings: Warning[] = [];

  if (!person.active) blockers.push('person_inactive');
  if (event.status === 'cancelled') blockers.push('event_cancelled');
  if (
    ctx.assignments.some(
      (a) => a.personId === personId && a.eventId === event.id && a.slotId !== slotId,
    )
  ) {
    blockers.push('same_event_twice');
  }
  if (isWeekPast(event.weekStart, ctx.now)) blockers.push('week_past');

  const busy = busyInterval(event);
  const others = personAssignments(personId, ctx, slotId).filter(({ e }) => e.id !== event.id);
  if (others.some(({ e }) => overlaps(busyInterval(e), busy))) warnings.push('overlap');

  if (
    ctx.absences.some(
      (ab) =>
        ab.personId === personId &&
        !ab.archived &&
        overlaps({ start: ab.startsAt, end: ab.endsAt }, busy),
    )
  ) {
    warnings.push('absent');
  }

  const load = loadOf(personId, { ...ctx, weekStart: event.weekStart }, slotId);
  const alreadyCounted = others.some(({ e }) => e.id === event.id);
  const extra = alreadyCounted ? 0 : eventHours(event);
  if (load.hours + extra > person.weeklyLimitHours) warnings.push('over_limit');

  if (!person.roleIds.includes(slot.jobRoleId)) warnings.push('role_not_enabled');

  return { ok: blockers.length === 0 && warnings.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------------------------
// Ranking (ADR-012 itens 1 e 2)

export interface HistoryIndex {
  /** Vezes que a pessoa fez a função naquele tipo de serviço. */
  hist(personId: string, jobRoleId: string, serviceTypeId: string | null | undefined): number;
}

export function buildHistoryIndex(facts: Pick<HistoryFact, 'personId' | 'jobRoleId' | 'serviceTypeId'>[]): HistoryIndex {
  const counts = new Map<string, number>();
  for (const f of facts) {
    if (!f.personId || !f.jobRoleId || !f.serviceTypeId) continue;
    const k = `${f.personId}|${f.jobRoleId}|${f.serviceTypeId}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return {
    hist: (personId, jobRoleId, serviceTypeId) =>
      serviceTypeId ? (counts.get(`${personId}|${jobRoleId}|${serviceTypeId}`) ?? 0) : 0,
  };
}

/** Fração do maior histórico que ainda conta como empate próximo. */
export const TIE_RATIO = 0.8;

const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, 'en', { numeric: true });

/**
 * Aptos da vaga em ordem: o grupo de empate (hist >= 0,8 x maior hist, ou todos quando o maior é 0)
 * por menor carga em horas e depois em atividades; os demais por histórico. Só entra quem não tem
 * bloqueio nem alerta.
 */
export function rankCandidates(slotId: string, ctx: WeekContext, history: HistoryIndex): Candidate[] {
  const slot = find(ctx.slots, slotId, 'vaga');
  const event = find(ctx.events, slot.eventId, 'evento');
  const weekCtx = { ...ctx, weekStart: event.weekStart };
  const apt: Candidate[] = [];
  for (const p of ctx.people) {
    if (!checkEligibility(p.id, slotId, ctx).ok) continue;
    const load = loadOf(p.id, weekCtx, slotId);
    apt.push({
      personId: p.id,
      code: p.code,
      hist: history.hist(p.id, slot.jobRoleId, event.serviceTypeId),
      loadHours: load.hours,
      loadCount: load.count,
      inTieGroup: false,
    });
  }
  const maxHist = apt.reduce((m, c) => Math.max(m, c.hist), 0);
  for (const c of apt) c.inTieGroup = maxHist === 0 || c.hist >= TIE_RATIO * maxHist;
  const byLoad = (a: Candidate, b: Candidate) =>
    a.loadHours - b.loadHours || a.loadCount - b.loadCount || b.hist - a.hist || byCode(a, b);
  const byHist = (a: Candidate, b: Candidate) =>
    b.hist - a.hist || a.loadHours - b.loadHours || a.loadCount - b.loadCount || byCode(a, b);
  return [...apt.filter((c) => c.inTieGroup).sort(byLoad), ...apt.filter((c) => !c.inTieGroup).sort(byHist)];
}

// ---------------------------------------------------------------------------------------------
// Lotes da pré-escala (ADR-012 item 3). Só códigos: nunca nome nem e-mail.

export interface ProposalBatchSlot {
  slot: string; // V..
  role: string; // R..
  type: string | null; // T..
  start: string; // ISO com fuso de Brasília
  end: string;
  hours: number;
  candidates: { person: string; hist: number; loadHours: number; loadCount: number; inTieGroup: boolean }[];
}

export interface ProposalBatch {
  index: number;
  slots: ProposalBatchSlot[];
  people: { person: string; loadHours: number; loadCount: number; limitHours: number }[];
}

export interface ProposalBatchOptions {
  batchSize?: number; // padrão 60
  maxCandidates?: number; // padrão 5
  /** Escolhas já feitas em lotes anteriores: saem das vagas abertas e entram na carga. */
  prior?: { slotId: string; personId: string }[];
}

/** Vagas que a pré-escala pode preencher: sem alocação confirmada, sem trava, de evento ativo e com equipe. */
export function openSlots(ctx: WeekContext): SlotLike[] {
  const events = indexBy(ctx.events, (e) => e.id);
  const bySlot = indexBy(ctx.assignments, (a) => a.slotId);
  return ctx.slots
    .filter((s) => {
      const e = events.get(s.eventId);
      const a = bySlot.get(s.id);
      if (!e || s.archived || e.status === 'cancelled' || e.noTeam) return false;
      if (e.weekStart !== ctx.weekStart) return false;
      return !a || (a.status !== 'confirmed' && !a.locked);
    })
    .sort((a, b) => {
      const ea = events.get(a.eventId) as EventLike;
      const eb = events.get(b.eventId) as EventLike;
      return busyInterval(ea).start.getTime() - busyInterval(eb).start.getTime() || byCode(a, b);
    });
}

function codeOf(list: { id: string; code: string }[] | undefined, id: string | null | undefined) {
  if (!id) return null;
  return list?.find((x) => x.id === id)?.code ?? null;
}

/**
 * Monta os lotes em ordem cronológica. A carga passa de um lote ao outro: as escolhas de `prior`
 * contam como feitas e, para os lotes ainda sem resposta, o primeiro apto de cada vaga é tomado
 * como provável, para a IA não receber cargas zeradas no lote seguinte.
 */
export function buildProposalBatches(
  ctx: WeekContext,
  history: HistoryIndex,
  opts: ProposalBatchOptions = {},
): ProposalBatch[] {
  const batchSize = opts.batchSize ?? 60;
  const maxCandidates = opts.maxCandidates ?? 5;
  const open = openSlots(ctx);
  const openIds = new Set(open.map((s) => s.id));
  const priorIds = new Set((opts.prior ?? []).map((p) => p.slotId));
  const slotsById = indexBy(ctx.slots, (s) => s.id);
  const people = indexBy(ctx.people, (p) => p.id);
  const events = indexBy(ctx.events, (e) => e.id);

  // Propostas antigas das vagas abertas serão substituídas: não contam na carga.
  const assignments: AssignmentLike[] = ctx.assignments.filter((a) => !openIds.has(a.slotId));
  for (const p of opts.prior ?? []) {
    const s = slotsById.get(p.slotId);
    if (s) assignments.push({ slotId: s.id, eventId: s.eventId, personId: p.personId, status: 'proposed', locked: false });
  }
  const work: WeekContext = { ...ctx, assignments };
  const pending = open.filter((s) => !priorIds.has(s.id));

  const batches: ProposalBatch[] = [];
  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize);
    const loads = new Map<string, { hours: number; count: number }>();
    const loadFor = (personId: string) => {
      let l = loads.get(personId);
      if (!l) loads.set(personId, (l = personLoad(personId, work)));
      return l;
    };
    const slots: ProposalBatchSlot[] = chunk.map((s) => {
      const e = events.get(s.eventId) as EventLike;
      const iv = busyInterval(e);
      const ranked = rankCandidates(s.id, work, history).slice(0, maxCandidates);
      return {
        slot: s.code,
        role: codeOf(ctx.jobRoles, s.jobRoleId) ?? s.jobRoleId,
        type: codeOf(ctx.serviceTypes, e.serviceTypeId),
        start: toLocalIso(iv.start),
        end: toLocalIso(iv.end),
        hours: eventHours(e),
        candidates: ranked.map((c) => {
          loadFor(c.personId);
          return { person: c.code, hist: c.hist, loadHours: c.loadHours, loadCount: c.loadCount, inTieGroup: c.inTieGroup };
        }),
      };
    });
    batches.push({
      index: batches.length,
      slots,
      people: [...loads.entries()]
        .map(([id, l]) => {
          const p = people.get(id) as PersonLike;
          return { person: p.code, loadHours: l.hours, loadCount: l.count, limitHours: p.weeklyLimitHours };
        })
        .sort((a, b) => a.person.localeCompare(b.person, 'en', { numeric: true })),
    });
    // Escolha provável deste lote, revalidada em ordem, para levar a carga ao próximo.
    for (const s of chunk) {
      const top = rankCandidates(s.id, work, history)[0];
      if (top) assignments.push({ slotId: s.id, eventId: s.eventId, personId: top.personId, status: 'proposed', locked: false });
    }
  }
  return batches;
}
