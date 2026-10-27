// Regras da semana: fuso, duração, carga, aptidão, ranking e lotes da pré-escala (ADR-002, ADR-012).
// Espelhadas nas funções SQL (tarefa 3); a tabela de casos de aptidão fica em cases/eligibility.ts.
import {
  addDays,
  hoursBetween,
  isoWeekday,
  localDate,
  overlaps,
  toLocalIso,
  zonedTime,
} from './time.ts';
import { nameTokens } from './names.ts';
import { ROLE_LEVELS } from './types.ts';
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
  WorkHours,
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

/** Vagas de função que não ocupa horário (Disponibilizador). */
function freeSlots(ctx: WeekContext): Set<string> {
  return new Set(ctx.slots.filter((s) => s.noHours).map((s) => s.id));
}

function personAssignments(personId: string, ctx: WeekContext, exceptSlotId?: string) {
  const events = indexBy(ctx.events, (e) => e.id);
  const free = freeSlots(ctx);
  const out: { a: AssignmentLike; e: EventLike; noHours: boolean }[] = [];
  for (const a of ctx.assignments) {
    if (a.personId !== personId || a.slotId === exceptSlotId) continue;
    const e = events.get(a.eventId);
    if (!e || e.status === 'cancelled') continue;
    out.push({ a, e, noHours: free.has(a.slotId) });
  }
  return out;
}

/** Horas e atividades da semana; a vaga de função que não ocupa horário conta a atividade, mas não as horas. */
function loadOf(personId: string, ctx: WeekContext, exceptSlotId?: string) {
  const seen = new Set<string>();
  let hours = 0;
  for (const { e, noHours } of personAssignments(personId, ctx, exceptSlotId)) {
    if (e.weekStart !== ctx.weekStart || seen.has(e.id)) continue;
    seen.add(e.id);
    if (!noHours) hours += eventHours(e);
  }
  return { hours, count: seen.size };
}

/** Carga da semana: horas e atividades de alocações propostas e confirmadas, sem eventos cancelados. */
export function personLoad(personId: string, ctx: WeekContext): { hours: number; count: number } {
  return loadOf(personId, ctx);
}

/**
 * O evento sai do horário de trabalho: em algum dia dele a pessoa não trabalha, ou o trecho do dia começa antes da
 * entrada ou acaba depois da saída. Dia inteiro sem período não conta. Espelha public.outside_work_hours (0022).
 */
export function outsideWorkHours(hours: WorkHours, e: EventLike): boolean {
  const iv = eventInterval(e);
  if (!iv) return false;
  for (const d of daysOf({ startsAt: iv.start, endsAt: iv.end })) {
    const w = hours[String(isoWeekday(d))];
    if (!w) return true;
    const from = Math.max(iv.start.getTime(), zonedTime(d).getTime());
    const to = Math.min(iv.end.getTime(), zonedTime(addDays(d, 1)).getTime());
    if (from < zonedTime(d, w[0]).getTime() || to > zonedTime(d, w[1]).getTime()) return true;
  }
  return false;
}

/** A pessoa é de outra sede: evento externo é só de Piracicaba; o resto segue a sede da série. Sem sede, não pesa. */
export function otherBase(person: PersonLike, e: EventLike): boolean {
  if (!person.base) return false;
  if (e.external) return person.base !== 'piracicaba';
  return Boolean(e.base && e.base !== person.base);
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
  // Função que não ocupa horário não bate horário, nem nesta vaga nem nas outras da pessoa.
  if (!slot.noHours && others.some(({ e, noHours }) => !noHours && overlaps(busyInterval(e), busy))) warnings.push('overlap');

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
  const extra = alreadyCounted || slot.noHours ? 0 : eventHours(event);
  if (load.hours + extra > person.weeklyLimitHours) warnings.push('over_limit');

  if (!person.roleIds.includes(slot.jobRoleId)) warnings.push('role_not_enabled');
  // Função que não ocupa horário (subir vídeo) se faz a qualquer hora.
  if (!slot.noHours && person.workHours && outsideWorkHours(person.workHours, event)) warnings.push('off_hours');
  if (otherBase(person, event)) warnings.push('other_base');

  return { ok: blockers.length === 0 && warnings.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------------------------
// Ranking (ADR-012 itens 1 e 2)

export interface HistoryIndex {
  /** Vezes que a pessoa fez a função naquele tipo de serviço. */
  hist(personId: string, jobRoleId: string, serviceTypeId: string | null | undefined): number;
  /**
   * Histórico na função e no tipo com o recente pesando mais (meia-vida de 26 semanas), só o que veio antes da
   * semana. Só existe quando os fatos trazem a semana.
   */
  recent?(personId: string, jobRoleId: string, serviceTypeId: string | null | undefined, weekStart: string): number;
  /** Vezes que a pessoa fez a função neste mesmo evento (série pelo título) nas 8 semanas antes da semana. */
  series?(personId: string, jobRoleId: string, title: string, weekStart: string): number;
  /** Semana da última vez que a pessoa fez a função no tipo, antes da semana; nula quando nunca fez. */
  lastWeek?(personId: string, jobRoleId: string, serviceTypeId: string | null | undefined, weekStart: string): string | null;
  /** Semana da última vez que a pessoa fez a função neste mesmo evento (série pelo título), antes da semana. */
  lastSeriesWeek?(personId: string, jobRoleId: string, title: string, weekStart: string): string | null;
}

/** A semana mais recente da lista antes de `weekStart`. */
function latestBefore(weeks: readonly string[] | undefined, weekStart: string): string | null {
  let best: string | null = null;
  for (const w of weeks ?? []) if (w < weekStart && (!best || w > best)) best = w;
  return best;
}

/** Meia-vida do peso do histórico, em semanas. */
export const HISTORY_HALF_LIFE_WEEKS = 26;
/** Janela da turma fixa: quem fez o mesmo evento nestas semanas antes vai na frente. */
export const SERIES_WINDOW_WEEKS = 8;

/** Palavras que mudam de uma semana para outra na mesma turma: ficam fora da série. */
const SERIES_NOISE = new Set(['aula', 'aulas', 'modulo', 'parte', 'encontro', 'turma', 'dia', 'semana', 'disciplina', 'professor', 'professora', 'prof', 'id']);

/**
 * Série do evento pelo título, para achar a turma fixa: a primeira linha do título sem números e sem as
 * palavras que mudam de semana para semana (aula, módulo, parte...). Um rótulo curto antes de ":" ("GRAVAÇÃO:",
 * "*DISPONIBILIZAR:", "Curso:") sai, para "GRAVAÇÃO: Virada Empresarial" e "GRAVAÇÃO: Reels" não virarem a mesma
 * série. "MBA em Gestão de Projetos - Aula 3" e "MBA em Gestão de Projetos - Aula 4" são a mesma série.
 */
export function eventSeries(title: string): string {
  // Só a primeira linha: nas planilhas e agendas, as linhas de baixo trazem a disciplina e o professor da semana.
  const first = title.split(/\r?\n/)[0] ?? title;
  const colon = first.indexOf(': ');
  const label = colon > 0 ? nameTokens(first.slice(0, colon)) : [];
  const body = label.length > 0 && label.length <= 2 ? first.slice(colon + 2) : first;
  return nameTokens(body)
    .filter((t) => !/^[0-9]+$/.test(t) && !SERIES_NOISE.has(t))
    .join(' ');
}

const WEEK_MS = 7 * 86_400_000;
const weeksBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / WEEK_MS;

export function buildHistoryIndex(
  facts: (Pick<HistoryFact, 'personId' | 'jobRoleId' | 'serviceTypeId'> & Partial<Pick<HistoryFact, 'weekStart' | 'title'>>)[],
): HistoryIndex {
  const counts = new Map<string, number>();
  const dated = new Map<string, string[]>();
  const bySeries = new Map<string, string[]>();
  let hasDates = false;
  for (const f of facts) {
    if (!f.personId || !f.jobRoleId) continue;
    if (f.weekStart && f.title) {
      const s = `${f.personId}|${f.jobRoleId}|${eventSeries(f.title)}`;
      bySeries.set(s, [...(bySeries.get(s) ?? []), f.weekStart]);
    }
    if (!f.serviceTypeId) continue;
    const k = `${f.personId}|${f.jobRoleId}|${f.serviceTypeId}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (f.weekStart) {
      hasDates = true;
      dated.set(k, [...(dated.get(k) ?? []), f.weekStart]);
    }
  }
  const index: HistoryIndex = {
    hist: (personId, jobRoleId, serviceTypeId) =>
      serviceTypeId ? (counts.get(`${personId}|${jobRoleId}|${serviceTypeId}`) ?? 0) : 0,
  };
  if (!hasDates) return index;
  index.recent = (personId, jobRoleId, serviceTypeId, weekStart) => {
    if (!serviceTypeId) return 0;
    let sum = 0;
    for (const w of dated.get(`${personId}|${jobRoleId}|${serviceTypeId}`) ?? []) {
      const age = weeksBetween(w, weekStart);
      if (age > 0) sum += 0.5 ** (age / HISTORY_HALF_LIFE_WEEKS);
    }
    return sum;
  };
  index.series = (personId, jobRoleId, title, weekStart) => {
    let n = 0;
    for (const w of bySeries.get(`${personId}|${jobRoleId}|${eventSeries(title)}`) ?? []) {
      const age = weeksBetween(w, weekStart);
      if (age > 0 && age <= SERIES_WINDOW_WEEKS) n++;
    }
    return n;
  };
  index.lastWeek = (personId, jobRoleId, serviceTypeId, weekStart) =>
    serviceTypeId ? latestBefore(dated.get(`${personId}|${jobRoleId}|${serviceTypeId}`), weekStart) : null;
  index.lastSeriesWeek = (personId, jobRoleId, title, weekStart) => latestBefore(bySeries.get(`${personId}|${jobRoleId}|${eventSeries(title)}`), weekStart);
  return index;
}

/** Fração do maior histórico que ainda conta como empate próximo. */
export const TIE_RATIO = 0.8;

const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, 'en', { numeric: true });

/**
 * Aptos da vaga em ordem (só entra quem não tem bloqueio nem alerta, menos o "fora do horário"):
 *   0. a turma fixa gravada da série (titular, depois reserva), quando alguém respondeu "virou o titular?";
 *   1. a turma fixa: quem fez a função neste mesmo evento nas 8 semanas antes, mais vezes primeiro, no horário ou
 *      fora dele;
 *   2. dentro do horário, o grupo de empate do histórico (>= 0,8 x o maior, ou todos quando o maior é 0), pela
 *      prioridade da função na lista da pessoa, depois menor carga em horas e em atividades;
 *   3. dentro do horário, os demais pelo histórico;
 *   4. fora do horário, pelo histórico (pedido do Raoni em 27/10/2026: pode ser sugerido, com o aviso).
 * O histórico é o recente pesando mais quando o índice tem as datas; senão, a contagem de sempre. Sem datas
 * nem prioridade definida, a ordem é a mesma de antes (só grupo de empate e carga).
 */
export function rankCandidates(slotId: string, ctx: WeekContext, history: HistoryIndex): Candidate[] {
  const slot = find(ctx.slots, slotId, 'vaga');
  const event = find(ctx.events, slot.eventId, 'evento');
  const weekCtx = { ...ctx, weekStart: event.weekStart };
  const apt: (Candidate & { score: number })[] = [];
  for (const p of ctx.people) {
    const elig = checkEligibility(p.id, slotId, ctx);
    if (elig.blockers.length > 0 || elig.warnings.some((w) => w !== 'off_hours')) continue;
    const offHours = elig.warnings.includes('off_hours');
    const pinned = event.titulars?.[slot.jobRoleId]?.indexOf(p.id) ?? -1;
    const load = loadOf(p.id, weekCtx, slotId);
    const hist = history.hist(p.id, slot.jobRoleId, event.serviceTypeId);
    const pos = p.rolePriority?.indexOf(slot.jobRoleId) ?? -1;
    const series = event.title && history.series ? history.series(p.id, slot.jobRoleId, event.title, event.weekStart) : 0;
    const level = p.roleLevels?.[slot.jobRoleId];
    apt.push({
      personId: p.id,
      code: p.code,
      hist,
      loadHours: load.hours,
      loadCount: load.count,
      inTieGroup: false,
      ...(series > 0 ? { series } : {}),
      ...(pos >= 0 ? { priority: pos } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(offHours ? { offHours } : {}),
      ...(pinned >= 0 ? { pinned } : {}),
      score: history.recent ? history.recent(p.id, slot.jobRoleId, event.serviceTypeId, event.weekStart) : hist,
    });
  }
  const prio = (c: Candidate) => c.priority ?? 0;
  // Nível: no trabalho complexo, Referência primeiro; no simples, a Referência vai por último (fica livre para
  // os complexos) e Apoio e Titular empatam.
  const lvl = (c: Candidate) => {
    const l = c.level ?? ROLE_LEVELS.titular;
    return event.complex ? -l : l === ROLE_LEVELS.referencia ? 1 : 0;
  };
  const pinnedFirst = apt.filter((c) => c.pinned !== undefined).sort((a, b) => (a.pinned ?? 0) - (b.pinned ?? 0));
  const free = apt.filter((c) => c.pinned === undefined);
  const fixed = free.filter((c) => (c.series ?? 0) > 0);
  const rest = free.filter((c) => !c.series && !c.offHours);
  const late = free.filter((c) => !c.series && c.offHours);
  const maxScore = rest.reduce((m, c) => Math.max(m, c.score), 0);
  for (const c of apt) c.inTieGroup = (c.series ?? 0) > 0 || (!c.offHours && (maxScore === 0 || c.score >= TIE_RATIO * maxScore));
  const bySeries = (a: (typeof apt)[number], b: (typeof apt)[number]) =>
    (b.series ?? 0) - (a.series ?? 0) || lvl(a) - lvl(b) || prio(a) - prio(b) || a.loadHours - b.loadHours || b.score - a.score || byCode(a, b);
  const byLoad = (a: (typeof apt)[number], b: (typeof apt)[number]) =>
    lvl(a) - lvl(b) || prio(a) - prio(b) || a.loadHours - b.loadHours || a.loadCount - b.loadCount || b.score - a.score || byCode(a, b);
  const byHist = (a: (typeof apt)[number], b: (typeof apt)[number]) =>
    b.score - a.score || lvl(a) - lvl(b) || prio(a) - prio(b) || a.loadHours - b.loadHours || a.loadCount - b.loadCount || byCode(a, b);
  const ordered = [
    ...pinnedFirst,
    ...fixed.sort(bySeries),
    ...rest.filter((c) => c.inTieGroup).sort(byLoad),
    ...rest.filter((c) => !c.inTieGroup).sort(byHist),
    ...late.sort(byHist),
  ];
  // O score (histórico ponderado) é só para ordenar; quem chama recebe os campos de Candidate.
  return ordered.map((c) => {
    const out: Candidate = { personId: c.personId, code: c.code, hist: c.hist, loadHours: c.loadHours, loadCount: c.loadCount, inTieGroup: c.inTieGroup };
    if (c.series) out.series = c.series;
    if (c.priority !== undefined) out.priority = c.priority;
    if (c.level !== undefined) out.level = c.level;
    if (c.offHours) out.offHours = true;
    if (c.pinned !== undefined) out.pinned = c.pinned;
    return out;
  });
}

// ---------------------------------------------------------------------------------------------
// Escala sugerida pelo histórico (sem IA), a semana inteira de uma vez.

/**
 * Ordem de preenchimento: 1) uma pessoa em cada evento (a primeira vaga aberta de cada um), para nenhuma demanda
 * ficar sem ninguém; 2) as outras vagas dos eventos que não são reunião; 3) por último, as reuniões. Dentro de
 * cada passo, em ordem de horário.
 */
export function fillOrder<S extends { id: string; eventId: string }>(slots: readonly S[], isMeeting: (eventId: string) => boolean): S[] {
  const first: S[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    if (isMeeting(s.eventId) || seen.has(s.eventId)) continue;
    seen.add(s.eventId);
    first.push(s);
  }
  const picked = new Set(first.map((s) => s.id));
  const rest = slots.filter((s) => !picked.has(s.id) && !isMeeting(s.eventId));
  const meetings = slots.filter((s) => isMeeting(s.eventId));
  return [...first, ...rest, ...meetings];
}

/**
 * A escala da semana pelo ranking, vaga por vaga, cada escolha contando na carga da seguinte:
 *   1. primeiro as turmas fixas da semana toda: quem fez o mesmo evento nas 8 semanas antes fica com a vaga,
 *      antes que um evento no mesmo horário o ocupe;
 *   2. depois o resto, pela fillOrder (uma pessoa por evento, as demais vagas, reuniões por último).
 * Devolve o candidato escolhido de cada vaga (com o histórico, a turma fixa e o nível, para o motivo).
 */
export function proposeWeek(ctx: WeekContext, history: HistoryIndex, isMeeting: (eventId: string) => boolean = () => false): Map<string, Candidate> {
  const work: WeekContext = { ...ctx, assignments: ctx.assignments.filter((a) => a.status === 'confirmed' || a.locked) };
  const out = new Map<string, Candidate>();
  const take = (slot: SlotLike, c: Candidate) => {
    work.assignments.push({ slotId: slot.id, eventId: slot.eventId, personId: c.personId, status: 'proposed', locked: false });
    out.set(slot.id, c);
  };
  const order = fillOrder(openSlots(work), isMeeting);
  for (const slot of order) {
    if (isMeeting(slot.eventId)) continue;
    const best = rankCandidates(slot.id, work, history)[0];
    if (best?.series || best?.pinned !== undefined) take(slot, best);
  }
  for (const slot of order) {
    if (out.has(slot.id)) continue;
    const best = rankCandidates(slot.id, work, history)[0];
    if (best) take(slot, best);
  }
  return out;
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
        hours: s.noHours ? 0 : eventHours(e),
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
