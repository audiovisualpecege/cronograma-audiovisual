// Visão da escala montada, compartilhada pela grade da semana e pela tela do evento.
import { buildHistoryIndex, isWeekPast, rankCandidates, type HistoryIndex, type WeekContext } from '@cronograma/core';
import { useMemo } from 'react';
import { toFact, type AssignmentRow, type EventRow, type HistoryFactRow, type SlotRow } from '../data/catalog';
import { activeSlots, needsTeam, seriesBases, slotState, weekContext, type WeekRows } from './model';

/** Escala da semana: contexto das regras, índice do histórico e o modelo da grade. */
export function useSchedule(rows: WeekRows, now: Date, today: string, historyRows: readonly HistoryFactRow[] | null) {
  const index = useMemo(() => buildHistoryIndex((historyRows ?? []).map(toFact)), [historyRows]);
  // Sede de cada série, de quem costuma fazer (outra sede não é sugerida).
  const bases = useMemo(() => seriesBases(historyRows, rows.people), [historyRows, rows.people]);
  // O relógio só importa por dia aqui (semana passada); recalcula quando as linhas mudam.
  const ctx = useMemo(() => weekContext(rows, now, bases), [rows, today, bases]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => scheduleModel(rows, ctx, index), [rows, ctx, index]);
  const proposed = rows.assignments.filter((a) => slotState(a) === 'proposed' && model.slotsByEvent.get(a.event_id)?.some((s) => s.id === a.slot_id));
  return { model, ctx, index, proposed, readOnly: isWeekPast(rows.weekStart, now) };
}

export interface ScheduleModel {
  rows: WeekRows;
  ctx: WeekContext;
  /** Eventos da semana em ordem de início, sem os ignorados por duplicidade. */
  events: EventRow[];
  slotsByEvent: Map<string, SlotRow[]>;
  bySlot: Map<string, AssignmentRow>;
  /**
   * Vagas abertas sem nenhum apto (US-013 EC-4). Calculado só para a vaga perguntada, e guardado: o ranking de
   * cada vaga aberta de uma semana grande custa caro, e a grade só pergunta das vagas abertas sem sugestão.
   */
  noApt: Pick<Set<string>, 'has'>;
  roleName: (id: string) => string;
  personName: (id: string | null | undefined) => string;
}

export function scheduleModel(rows: WeekRows, ctx: WeekContext, history: HistoryIndex): ScheduleModel {
  const roles = new Map(rows.roles.map((r) => [r.id, r.name]));
  const people = new Map(rows.people.map((p) => [p.id, p.name]));
  const bySlot = new Map(rows.assignments.map((a) => [a.slot_id, a]));
  const slotsByEvent = new Map<string, SlotRow[]>();
  for (const s of activeSlots(rows)) slotsByEvent.set(s.event_id, [...(slotsByEvent.get(s.event_id) ?? []), s]);
  const events = rows.events.filter((e) => !e.ignored).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title, 'pt-BR'));
  const teamEvents = new Set(events.filter((e) => needsTeam(e, rows.types)).map((e) => e.id));
  const slotEvent = new Map([...slotsByEvent.values()].flat().map((s) => [s.id, s.event_id]));
  const asked = new Map<string, boolean>();
  const noApt = {
    has(slotId: string) {
      let v = asked.get(slotId);
      if (v === undefined) {
        const eventId = slotEvent.get(slotId);
        v = Boolean(eventId && teamEvents.has(eventId)) && slotState(bySlot.get(slotId)) === 'open' && rankCandidates(slotId, ctx, history).length === 0;
        asked.set(slotId, v);
      }
      return v;
    },
  };
  return {
    rows,
    ctx,
    events,
    slotsByEvent,
    bySlot,
    noApt,
    roleName: (id) => roles.get(id) ?? 'Função',
    personName: (id) => (id ? (people.get(id) ?? 'Pessoa') : ''),
  };
}
