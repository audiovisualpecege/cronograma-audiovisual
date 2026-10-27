// Regras da grade da semana, puras: as vagas previstas da semana ainda não montada (para sugerir e escolher antes
// da montagem), a chave estável de cada vaga, os dias em colunas com as folgas, a família de cada atividade (cor
// do cartão), os avisos do evento e o placar.
import { addDays, eventSeries, nameTokens, zonedTime, type AbsenceLike } from '@cronograma/core';
import { seriesRuleMap, type AssignmentRow, type EventRow, type HistoryFactRow, type ServiceTypeRow, type SlotRow } from '../data/catalog';
import type { Draft } from './historyProposal';
import { estimatedCrew, eventsByDay, isMarker, isMeetingEvent, needsTeam, slotState, weekDays, type AutoSize, type CrewOrigin, type TimeOff, type WeekRows } from './model';
import type { ScheduleModel } from './schedule';

const PLAN = 'plan:';

/** Vaga prevista (semana ainda sem montagem): existe só na tela, até a montagem criar a de verdade. */
export const isPlanned = (slotId: string) => slotId.startsWith(PLAN);

/** De onde vieram as vagas previstas do evento (marca "pela série" no cartão). */
export const crewOrigin = (e: EventRow): CrewOrigin => (e.crew_origin as CrewOrigin | undefined) ?? null;

/**
 * A semana como ficaria montada: sem montagem, cada evento que pede equipe ganha as vagas que a montagem criaria,
 * com a alocação aberta: as aprendidas pela série, senão a equipe do porte (o escolhido, senão o aplicado sozinho
 * pela série ou pelo histórico, senão o padrão do tipo). Assim a grade mostra, sugere e escolhe pessoas antes de
 * montar.
 */
export function plannedRows(rows: WeekRows, auto: ReadonlyMap<string, AutoSize> = new Map()): WeekRows {
  if (rows.week) return rows;
  const rules = seriesRuleMap(rows.seriesRules);
  const slots: SlotRow[] = [];
  const assignments: AssignmentRow[] = [];
  const events = rows.events.map((e) => {
    const rule = rules.get(eventSeries(e.title));
    const learned = Boolean(rule?.crew && rule.crew_type_id === e.service_type_id);
    const size = auto.get(e.id);
    if (!learned && !size) return e;
    return { ...e, ...(size && !learned ? { size: size.size } : {}), crew_origin: learned ? 'series' : size?.from };
  });
  for (const e of events) {
    if (!needsTeam(e, rows.types)) continue;
    for (const c of estimatedCrew(e, rows.types, rows.crew, rules.get(eventSeries(e.title)))) {
      for (let i = 0; i < c.quantity; i++) {
        const id = `${PLAN}${e.id}:${c.job_role_id}:${i}`;
        slots.push({ id, version: 0, updated_at: e.updated_at, event_id: e.id, job_role_id: c.job_role_id, archived_at: null });
        assignments.push({ id: `a-${id}`, version: 0, updated_at: e.updated_at, slot_id: id, event_id: e.id, person_id: null, status: null, locked: false, warnings: [] });
      }
    }
  }
  return { ...rows, events, slots, assignments };
}

/**
 * Chave de cada vaga que vale antes e depois da montagem: evento, função e a ordem entre as vagas da mesma função
 * no evento. Liga a escolha feita numa vaga prevista à vaga criada pela montagem.
 */
export function slotKeys(slots: readonly SlotRow[]): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  const ordered = [...slots].filter((s) => !s.archived_at).sort((a, b) => a.event_id.localeCompare(b.event_id) || a.job_role_id.localeCompare(b.job_role_id) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  for (const s of ordered) {
    const base = `${s.event_id}|${s.job_role_id}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(s.id, `${base}|${n}`);
  }
  return out;
}

/** Família da atividade: cada uma com uma cor, para o olho separar sem ler. */
export type ActivityKind = 'aula' | 'producao' | 'reuniao' | 'marcacao';

export const KIND_LABEL: Record<ActivityKind, string> = {
  aula: 'Aulas e cursos',
  producao: 'Produção',
  reuniao: 'Reuniões',
  marcacao: 'Sem equipe',
};

const AULA = /\b(aula|aulas|curso|cursos|mba|transmissao|transmitir|disponibilizar|webinar)\b/;

export function activityKind(e: EventRow, types: readonly ServiceTypeRow[]): ActivityKind {
  if (isMarker(e, types) || (!needsTeam(e, types) && e.status !== 'cancelled')) return 'marcacao';
  if (isMeetingEvent(e, types)) return 'reuniao';
  const name = nameTokens(types.find((t) => t.id === e.service_type_id)?.name ?? e.title).join(' ');
  return AULA.test(name) ? 'aula' : 'producao';
}

/** Primeira linha do título: as de baixo trazem disciplina e professor, que poluem o cartão. */
export function shortTitle(title: string): string {
  return (title.split(/\r?\n/)[0] ?? title).trim() || 'Sem título';
}

export interface BoardDay {
  date: string;
  label: string;
  short: string;
  /** Atividades com cartão (pedem equipe, canceladas ou com estrela), em ordem de horário. */
  cards: EventRow[];
  /** Reuniões, folgas e o que não pede equipe: uma linha fina no fim do dia. */
  lines: EventRow[];
  /** Quem está fora no dia. */
  off: TimeOff[];
}

/** Os sete dias com as atividades e as folgas de cada um; os ignorados por duplicidade ficam de fora. */
export function boardDays(rows: WeekRows, timeOff: readonly TimeOff[]): BoardDay[] {
  const byDay = eventsByDay(rows.weekStart, rows.events.filter((e) => !e.ignored));
  return weekDays(rows.weekStart).map((d) => {
    const all = byDay.get(d.date) ?? [];
    return {
      ...d,
      cards: all.filter((e) => !isMarker(e, rows.types)),
      lines: all.filter((e) => isMarker(e, rows.types)),
      off: timeOff.filter((t) => t.from <= d.date && d.date <= t.to),
    };
  });
}

/**
 * Folgas e férias vindas da agenda (não cadastradas) que valem: contam como ausência na sugestão e na escolha,
 * sem gravar nada. A desmarcada na faixa do dia não conta; as cadastradas sempre contam (já estão no contexto).
 */
export function timeOffAbsences(items: readonly TimeOff[], dropped: ReadonlySet<string>): AbsenceLike[] {
  return items
    .filter((t) => t.agendaTitle && t.personId && !dropped.has(t.key))
    .map((t) => ({ personId: t.personId as string, startsAt: zonedTime(t.from, '00:00'), endsAt: zonedTime(addDays(t.to, 1), '00:00') }));
}

export type ChipState = 'confirmed' | 'suggested' | 'open';

/** Ficha da vaga: confirmada (verde), sugestão ou proposta (tracejada) e aberta (vermelha). */
export function chipState(a: AssignmentRow | undefined, draft: Draft | undefined): ChipState {
  const s = slotState(a);
  if (s === 'confirmed') return 'confirmed';
  return s === 'proposed' || draft ? 'suggested' : 'open';
}

/** Avisos do evento, para o triângulo no canto do cartão. */
export function eventAlerts(e: EventRow, slotCount: number, built: boolean, types: readonly ServiceTypeRow[]): string[] {
  const out: string[] = [];
  if (e.status === 'cancelled') return slotCount > 0 ? ['cancelado na agenda: desfaça a escala'] : [];
  if (!e.service_type_id) out.push('tipo de serviço a definir');
  if (e.status === 'changed') out.push('mudou na agenda');
  if (e.crew_outdated) out.push('a equipe típica do tipo mudou');
  if (e.duplicate_group) out.push('possível duplicado');
  if (built && slotCount === 0 && e.service_type_id && needsTeam(e, types)) out.push('sem vagas');
  return out;
}

/** "Fulano virou o titular?": a mesma pessoa fez a função nas duas últimas vezes da série, e não é a titular. */
export interface TitularAsk {
  eventId: string;
  series: string;
  roleId: string;
  personId: string;
  /** Titular de hoje: a gravada, senão quem mais fez a série nas 8 semanas antes. */
  current: string | null;
}

/** Semanas da janela da turma fixa (SERIES_WINDOW_WEEKS do core). */
const FIXED_WINDOW_DAYS = 56;

/**
 * As perguntas "virou o titular?" da semana: para cada série e função de uma vaga só, quando a mesma pessoa fez as
 * duas últimas vezes (no histórico, que inclui as semanas publicadas) e ela não é a titular de hoje. Uma pergunta
 * por série e função, no primeiro evento dela.
 */
export function titularAsks(rows: WeekRows, slots: ReadonlyMap<string, readonly SlotRow[]>, facts: readonly HistoryFactRow[] | null): TitularAsk[] {
  const byKey = new Map<string, Map<string, Set<string>>>();
  for (const f of facts ?? []) {
    if (!f.person_id || !f.job_role_id || !f.title || f.week_start >= rows.weekStart) continue;
    const key = `${eventSeries(f.title)}|${f.job_role_id}`;
    const weeks = byKey.get(key) ?? new Map<string, Set<string>>();
    weeks.set(f.week_start, (weeks.get(f.week_start) ?? new Set()).add(f.person_id));
    byKey.set(key, weeks);
  }
  const rules = seriesRuleMap(rows.seriesRules);
  const since = addDays(rows.weekStart, -FIXED_WINDOW_DAYS);
  const asked = new Set<string>();
  const out: TitularAsk[] = [];
  for (const e of rows.events) {
    if (!needsTeam(e, rows.types)) continue;
    const series = eventSeries(e.title);
    const roles = new Map<string, number>();
    for (const s of slots.get(e.id) ?? []) roles.set(s.job_role_id, (roles.get(s.job_role_id) ?? 0) + 1);
    for (const [roleId, n] of roles) {
      const key = `${series}|${roleId}`;
      const weeks = byKey.get(key);
      if (n !== 1 || !series || !weeks || asked.has(key)) continue;
      const [w1, w2] = [...weeks.keys()].sort().reverse();
      if (!w1 || !w2) continue;
      const both = [...(weeks.get(w1) ?? [])].filter((p) => weeks.get(w2)?.has(p));
      if (both.length !== 1) continue;
      const personId = both[0] as string;
      const counts = new Map<string, number>();
      for (const [w, people] of weeks) if (w >= since) for (const p of people) counts.set(p, (counts.get(p) ?? 0) + 1);
      const deduced = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const current = rules.get(series)?.titulars?.[roleId]?.[0] ?? deduced;
      if (current === personId) continue;
      asked.add(key);
      out.push({ eventId: e.id, series, roleId, personId, current });
    }
  }
  return out;
}

export interface BoardCounts {
  confirmed: number;
  suggested: number;
  open: number;
  alerts: number;
}

/** Placar da semana: vagas dos eventos que pedem equipe por situação, e os avisos (vagas e eventos). */
export function boardCounts(model: ScheduleModel, drafts: ReadonlyMap<string, Draft>, built: boolean): BoardCounts {
  const out: BoardCounts = { confirmed: 0, suggested: 0, open: 0, alerts: 0 };
  const types = model.rows.types;
  for (const e of model.events) {
    const slots = model.slotsByEvent.get(e.id) ?? [];
    if (eventAlerts(e, slots.length, built, types).length > 0) out.alerts++;
    if (!needsTeam(e, types)) continue;
    for (const s of slots) {
      const a = model.bySlot.get(s.id);
      out[chipState(a, drafts.get(s.id))]++;
      if ((a?.warnings ?? []).some((w) => w !== 'role_archived')) out.alerts++;
    }
  }
  return out;
}
