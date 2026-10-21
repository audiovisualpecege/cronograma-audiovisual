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

export function proposeByHistory(ctx: WeekContext, history: HistoryIndex): Map<string, Draft> {
  const work: WeekContext = { ...ctx, assignments: ctx.assignments.filter((a) => a.status === 'confirmed' || a.locked) };
  const out = new Map<string, Draft>();
  for (const slot of openSlots(work)) {
    const best = rankCandidates(slot.id, work, history)[0];
    if (!best) continue;
    work.assignments.push({ slotId: slot.id, eventId: slot.eventId, personId: best.personId, status: 'proposed', locked: false });
    const load = hoursText(best.loadHours);
    out.set(slot.id, {
      personId: best.personId,
      reason: best.hist > 0 ? `fez ${best.hist} ${best.hist === 1 ? 'vez' : 'vezes'} esta função neste tipo; ${load} na semana` : `sem histórico neste tipo; menor carga (${load} na semana)`,
    });
  }
  return out;
}
