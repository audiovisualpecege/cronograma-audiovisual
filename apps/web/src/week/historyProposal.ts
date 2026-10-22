// Escala sugerida pelo histórico, no próprio app, sem a IA. A escolha é do núcleo (proposeWeek): primeiro as
// turmas fixas da semana toda, depois uma pessoa por evento, as demais vagas e as reuniões por último, sempre o
// primeiro do ranking (função, horário livre, sem ausência, dentro do limite; turma fixa, nível, prioridade,
// histórico recente e carga). Aqui só vira sugestão com o motivo, para a tela.
import { proposeWeek, type HistoryIndex, type WeekContext } from '@cronograma/core';
import { createContext } from 'react';
import type { AssignmentRow } from '../data/catalog';
import { hoursText } from './model';

export { fillOrder } from '@cronograma/core';

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

export function proposeByHistory(ctx: WeekContext, history: HistoryIndex, isMeeting: (eventId: string) => boolean = () => false): Map<string, Draft> {
  const out = new Map<string, Draft>();
  for (const [slotId, best] of proposeWeek(ctx, history, isMeeting)) {
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
    out.set(slotId, { personId: best.personId, reason: parts.join('; ') });
  }
  return out;
}
