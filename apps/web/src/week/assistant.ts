// Regras do Assistente da semana, puras: a família de cada atividade (cor e ícone na tela), os dias que têm o que
// validar, as folgas da agenda que valem como ausência na sugestão e o que "validar o dia" grava.
import { addDays, nameTokens, zonedTime, type AbsenceLike } from '@cronograma/core';
import type { AssignmentRow, EventRow, ServiceTypeRow, SlotRow } from '../data/catalog';
import type { Draft } from './historyProposal';
import { eventsByDay, isMarker, isMeetingEvent, needsTeam, slotState, weekDays, type TimeOff, type WeekRows } from './model';

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
  if (isMarker(e, types) || !needsTeam(e, types)) return 'marcacao';
  if (isMeetingEvent(e, types)) return 'reuniao';
  const name = nameTokens(types.find((t) => t.id === e.service_type_id)?.name ?? e.title).join(' ');
  return AULA.test(name) ? 'aula' : 'producao';
}

export interface AssistantDay {
  date: string;
  label: string;
  short: string;
  /** Atividades que pedem equipe, em ordem de horário. */
  events: EventRow[];
  /** Folgas, férias e lembretes do dia: aparecem à parte, sem vagas. */
  markers: EventRow[];
}

/**
 * Os dias da semana com atividade que pede equipe, de segunda a domingo. Dia só com folga ou lembrete não vira
 * passo (férias de uma semana não criam cinco passos vazios); as folgas já foram vistas no primeiro passo.
 */
export function assistantDays(rows: WeekRows): AssistantDay[] {
  const live = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled');
  const byDay = eventsByDay(rows.weekStart, live);
  return weekDays(rows.weekStart)
    .map((d) => {
      const all = byDay.get(d.date) ?? [];
      return { ...d, events: all.filter((e) => needsTeam(e, rows.types)), markers: all.filter((e) => !needsTeam(e, rows.types)) };
    })
    .filter((d) => d.events.length > 0);
}

/**
 * Folgas e férias vindas da agenda (não cadastradas) que o administrador confirmou: valem como ausência na
 * sugestão do Assistente, sem gravar nada. As cadastradas já contam.
 */
export function timeOffAbsences(items: readonly TimeOff[], kept: ReadonlySet<string>): AbsenceLike[] {
  return items
    .filter((t) => t.agendaTitle && t.personId && kept.has(t.key))
    .map((t) => ({ personId: t.personId as string, startsAt: zonedTime(t.from, '00:00'), endsAt: zonedTime(addDays(t.to, 1), '00:00') }));
}

export interface DayValidation {
  /** Sugestões que viram escala confirmada. */
  drafts: { assignment: AssignmentRow; personId: string }[];
  /** Propostas (da IA ou de antes) que viram escala confirmada. */
  proposals: AssignmentRow[];
  /** Vagas que ficam abertas: ninguém confirmado, proposto nem sugerido. */
  open: number;
  confirmed: number;
}

/** O que "validar o dia" faz nas vagas das atividades do dia. */
export function dayValidation(
  events: readonly EventRow[],
  slotsByEvent: ReadonlyMap<string, readonly SlotRow[]>,
  bySlot: ReadonlyMap<string, AssignmentRow>,
  drafts: ReadonlyMap<string, Draft>,
): DayValidation {
  const out: DayValidation = { drafts: [], proposals: [], open: 0, confirmed: 0 };
  for (const e of events) {
    for (const s of slotsByEvent.get(e.id) ?? []) {
      const a = bySlot.get(s.id);
      const state = slotState(a);
      const d = drafts.get(s.id);
      if (state === 'confirmed') out.confirmed++;
      else if (state === 'proposed' && a) out.proposals.push(a);
      else if (d && a) out.drafts.push({ assignment: a, personId: d.personId });
      else out.open++;
    }
  }
  return out;
}

/** Primeira linha do título: as de baixo trazem disciplina e professor, que poluem o cartão. */
export function shortTitle(title: string): string {
  return (title.split(/\r?\n/)[0] ?? title).trim() || 'Sem título';
}
