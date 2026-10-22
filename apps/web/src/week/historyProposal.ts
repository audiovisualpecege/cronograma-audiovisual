// Escala sugerida pelo histórico, no próprio app, sem a IA: para cada vaga aberta, em ordem de horário, o
// primeiro do ranking (rankCandidates). O ranking já só traz quem tem a função, está livre no horário, sem
// ausência e dentro do limite de horas; entre esses, quem mais fez aquela função naquele tipo de serviço e,
// em empate próximo, quem tem menos carga na semana. Cada escolha entra na carga antes da vaga seguinte, para a
// mesma pessoa não cair em dois lugares ao mesmo tempo nem passar do limite.
import { openSlots, rankCandidates, type HistoryIndex, type WeekContext } from '@cronograma/core';
import { createContext } from 'react';
import type { AssignmentRow } from '../data/catalog';
import { hoursText } from './model';

export interface Draft {
  personId: string;
  reason: string;
}

/**
 * Sugestões ainda não gravadas, para a linha da vaga (SlotLine) mostrar e agir. Só a tela de proposta fornece;
 * fora dela não há sugestão.
 */
export interface DraftApi {
  drafts: ReadonlyMap<string, Draft>;
  accept: (slotId: string, assignment: AssignmentRow) => void;
  discard: (slotId: string) => void;
}

export const DraftContext = createContext<DraftApi | null>(null);

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

export function proposeByHistory(ctx: WeekContext, history: HistoryIndex, isMeeting: (eventId: string) => boolean = () => false): Map<string, Draft> {
  const work: WeekContext = { ...ctx, assignments: ctx.assignments.filter((a) => a.status === 'confirmed' || a.locked) };
  const out = new Map<string, Draft>();
  for (const slot of fillOrder(openSlots(work), isMeeting)) {
    const best = rankCandidates(slot.id, work, history)[0];
    if (!best) continue;
    work.assignments.push({ slotId: slot.id, eventId: slot.eventId, personId: best.personId, status: 'proposed', locked: false });
    const load = `${hoursText(best.loadHours)} na semana`;
    const vezes = (n: number) => `${n} ${n === 1 ? 'vez' : 'vezes'}`;
    const parts = [
      best.series
        ? `fez este mesmo evento ${vezes(best.series)} nas últimas 8 semanas`
        : best.hist > 0
          ? `fez ${vezes(best.hist)} esta função neste tipo`
          : 'sem histórico neste tipo',
    ];
    if (best.level === 3) parts.push('Referência na função');
    parts.push(best.series || best.hist > 0 ? load : `menor carga (${load})`);
    out.set(slot.id, { personId: best.personId, reason: parts.join('; ') });
  }
  return out;
}
