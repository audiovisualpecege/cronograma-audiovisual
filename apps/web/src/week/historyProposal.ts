// Escala sugerida pelo histórico, no próprio app, sem a IA. A escolha é do núcleo (proposeWeek): primeiro as
// turmas fixas da semana toda, depois uma pessoa por evento, as demais vagas e as reuniões por último, sempre o
// primeiro do ranking (função, horário livre, sem ausência, dentro do limite; turma fixa, nível, prioridade,
// histórico recente e carga). Aqui só vira sugestão com o motivo, para a tela.
import { proposeWeek, type Candidate, type HistoryIndex, type WeekContext } from '@cronograma/core';
import { agoText, hoursText } from './model';

export { fillOrder } from '@cronograma/core';

export interface Draft {
  personId: string;
  reason: string;
  /** Alertas que a sugestão já leva (fora do horário): confirmar é escalar mesmo assim. */
  warnings?: string[];
}

const vezes = (n: number) => `${n} ${n === 1 ? 'vez' : 'vezes'}`;

/**
 * Por que a pessoa serve para a vaga, com a última vez que fez: "fez este evento na semana passada (3 vezes em
 * 8 semanas)", "fez esta função neste tipo há 5 semanas (12 vezes)" ou "nunca fez neste tipo".
 */
export function historyReason(
  ctx: WeekContext,
  history: HistoryIndex,
  slotId: string,
  c: Pick<Candidate, 'personId' | 'hist' | 'series' | 'level'>,
): string {
  const slot = ctx.slots.find((s) => s.id === slotId);
  const event = ctx.events.find((e) => e.id === slot?.eventId);
  if (!slot || !event) return '';
  const parts: string[] = [];
  const lastSeries = c.series && event.title ? history.lastSeriesWeek?.(c.personId, slot.jobRoleId, event.title, event.weekStart) : null;
  const last = c.hist > 0 ? history.lastWeek?.(c.personId, slot.jobRoleId, event.serviceTypeId, event.weekStart) : null;
  if (c.series) parts.push(`fez este evento ${lastSeries ? agoText(lastSeries, event.weekStart) : 'há pouco'} (${vezes(c.series)} em 8 semanas)`);
  else if (c.hist > 0) parts.push(`fez esta função neste tipo ${last ? `${agoText(last, event.weekStart)} ` : ''}(${vezes(c.hist)})`);
  else parts.push('nunca fez neste tipo');
  if (c.level === 3) parts.push('Referência na função');
  return parts.join('; ');
}

export function proposeByHistory(ctx: WeekContext, history: HistoryIndex, isMeeting: (eventId: string) => boolean = () => false): Map<string, Draft> {
  const out = new Map<string, Draft>();
  for (const [slotId, best] of proposeWeek(ctx, history, isMeeting)) {
    const load = `${hoursText(best.loadHours)} na semana`;
    const late = best.offHours ? '; fora do horário de trabalho' : '';
    out.set(slotId, {
      personId: best.personId,
      reason: `${historyReason(ctx, history, slotId, best)}; ${load}${late}`,
      ...(best.offHours ? { warnings: ['off_hours'] } : {}),
    });
  }
  return out;
}
