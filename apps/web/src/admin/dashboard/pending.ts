// Pendências do painel do administrador (US-001 AC-2): mudanças da agenda, vagas sem escala, propostas,
// alterações não publicadas, duplicados e semanas sem montagem, da semana atual em diante.
import { isWeekPast, localDate, localTime } from '@cronograma/core';
import type { AssignmentRow, EventRow, PublishedRow, ServiceTypeRow, SlotRow, WeekRow } from '../../data/catalog';
import { activeSlots, dayMonth, needsTeam, slotState, unpublishedChanges } from '../../week/model';

export interface PendingItem {
  key: string;
  kind: 'review' | 'unpublished' | 'open' | 'proposed' | 'duplicate' | 'unbuilt';
  text: string;
  link: string;
}

export interface PendingInput {
  events: readonly EventRow[];
  weeks: readonly WeekRow[];
  slots: readonly SlotRow[];
  assignments: readonly AssignmentRow[];
  published: readonly PublishedRow[];
  types: readonly ServiceTypeRow[];
  now: Date;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function dashboardPending(input: PendingInput): PendingItem[] {
  const { now, types } = input;
  const live = (ws: string) => !isWeekPast(ws, now);
  const items: PendingItem[] = [];
  const events = input.events.filter((e) => live(e.week_start) && !e.ignored);
  const byWeek = new Map<string, EventRow[]>();
  for (const e of events) byWeek.set(e.week_start, [...(byWeek.get(e.week_start) ?? []), e]);
  const weekRows = new Map(input.weeks.map((w) => [w.week_start, w]));

  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  for (const e of sorted) {
    if (!e.review_pending) continue;
    const what = e.status === 'cancelled' ? 'cancelado na agenda' : e.status === 'changed' ? 'mudou na agenda' : e.restored ? 'voltou à agenda, sem escala' : 'novo na agenda, sem escala';
    items.push({ key: `review:${e.id}`, kind: 'review', text: `${e.title || 'Sem título'} (${dayMonth(localDate(new Date(e.starts_at)))}): ${what}`, link: `/evento/${e.id}` });
  }

  for (const ws of [...byWeek.keys()].sort()) {
    const weekEvents = byWeek.get(ws) ?? [];
    const week = weekRows.get(ws);
    const label = `Semana de ${dayMonth(ws)}`;
    if (!week) {
      const n = weekEvents.filter((e) => e.status !== 'cancelled').length;
      if (n > 0) items.push({ key: `unbuilt:${ws}`, kind: 'unbuilt', text: `${label} sem montagem: ${plural(n, 'evento', 'eventos')} na agenda`, link: `/semana/${ws}` });
      continue;
    }
    const ids = new Set(weekEvents.map((e) => e.id));
    const slots = input.slots.filter((s) => ids.has(s.event_id));
    const assignments = input.assignments.filter((a) => ids.has(a.event_id));
    const rows = { weekStart: ws, week, events: weekEvents, slots, assignments, published: input.published.filter((p) => p.week_id === week.id), people: [], personRoles: [], absences: [], roles: [], types: [...types], crew: [] };
    const changes = unpublishedChanges(rows);
    if (changes > 0) items.push({ key: `unpublished:${ws}`, kind: 'unpublished', text: `${label}: ${plural(changes, 'alteração não publicada', 'alterações não publicadas')}`, link: `/semana/${ws}` });
    const team = new Set(weekEvents.filter((e) => needsTeam(e, types)).map((e) => e.id));
    const bySlot = new Map(assignments.map((a) => [a.slot_id, a]));
    let open = 0;
    let proposed = 0;
    for (const s of activeSlots(rows)) {
      if (!team.has(s.event_id)) continue;
      const state = slotState(bySlot.get(s.id));
      if (state === 'open') open += 1;
      if (state === 'proposed') proposed += 1;
    }
    if (open > 0) items.push({ key: `open:${ws}`, kind: 'open', text: `${label}: ${plural(open, 'vaga sem escala', 'vagas sem escala')}`, link: `/semana/${ws}` });
    if (proposed > 0) items.push({ key: `proposed:${ws}`, kind: 'proposed', text: `${label}: ${plural(proposed, 'proposta para revisar', 'propostas para revisar')}`, link: `/semana/${ws}` });
  }

  for (const e of sorted) {
    if (e.duplicate_group && e.status !== 'cancelled') {
      items.push({ key: `duplicate:${e.id}`, kind: 'duplicate', text: `Possível duplicado: ${e.title || 'Sem título'} (${dayMonth(localDate(new Date(e.starts_at)))})`, link: `/evento/${e.id}` });
    }
  }
  return items;
}

const STALE_MS = 5 * 60_000;

/** Aviso do batimento do serviço de fundo (TechSpec, Monitoring): parado depois de 5 minutos sem sinal. */
export function workerAlert(seenAt: string | null | undefined, now: Date): string | null {
  if (!seenAt) return 'O serviço de fundo ainda não deu sinal. Releitura das agendas, pré-escala e avisos dependem dele.';
  const seen = new Date(seenAt);
  if (now.getTime() - seen.getTime() <= STALE_MS) return null;
  const when = localDate(seen) === localDate(now) ? localTime(seen) : `${dayMonth(localDate(seen))} ${localTime(seen)}`;
  return `Serviço de fundo parado desde ${when}`;
}
