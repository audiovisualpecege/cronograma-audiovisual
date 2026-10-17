// Visão da escala montada, compartilhada pela grade, pela lista e pela tela do evento.
import { rankCandidates, type HistoryIndex, type WeekContext } from '@cronograma/core';
import type { AssignmentRow, EventRow, SlotRow } from '../data/catalog';
import { activeSlots, needsTeam, slotState, type WeekRows } from './model';

export interface ScheduleModel {
  rows: WeekRows;
  ctx: WeekContext;
  /** Eventos da semana em ordem de início, sem os ignorados por duplicidade. */
  events: EventRow[];
  slotsByEvent: Map<string, SlotRow[]>;
  bySlot: Map<string, AssignmentRow>;
  /** Vagas abertas sem nenhum apto (US-013 EC-4). */
  noApt: Set<string>;
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
  const noApt = new Set<string>();
  for (const e of events) {
    if (!needsTeam(e, rows.types)) continue;
    for (const s of slotsByEvent.get(e.id) ?? []) {
      if (slotState(bySlot.get(s.id)) !== 'open') continue;
      if (rankCandidates(s.id, ctx, history).length === 0) noApt.add(s.id);
    }
  }
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
