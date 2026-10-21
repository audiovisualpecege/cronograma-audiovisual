import { buildHistoryIndex, isWeekPast } from '@cronograma/core';
import { useMemo, useState } from 'react';
import { toFact, type HistoryFactRow } from '../data/catalog';
import { slotState, weekContext, type WeekRows } from './model';
import { PersonPicker } from './PersonPicker';
import { scheduleModel } from './schedule';
import { ScheduleList } from './ScheduleList';

/** Escala montada da semana: contexto das regras, índice do histórico e o modelo da lista. */
export function useSchedule(rows: WeekRows, now: Date, today: string, historyRows: readonly HistoryFactRow[] | null) {
  const index = useMemo(() => buildHistoryIndex((historyRows ?? []).map(toFact)), [historyRows]);
  // O relógio só importa por dia aqui (semana passada); recalcula quando as linhas mudam.
  const ctx = useMemo(() => weekContext(rows, now), [rows, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => scheduleModel(rows, ctx, index), [rows, ctx, index]);
  const proposed = rows.assignments.filter((a) => slotState(a) === 'proposed' && model.slotsByEvent.get(a.event_id)?.some((s) => s.id === a.slot_id));
  return { model, ctx, index, proposed, readOnly: isWeekPast(rows.weekStart, now) };
}

interface EditorProps {
  schedule: ReturnType<typeof useSchedule>;
  today: string;
}

/** Lista por evento com a escolha de pessoa (US-014, US-015). */
export function ScheduleEditor({ schedule, today }: EditorProps) {
  const { model, ctx, index, readOnly } = schedule;
  const [picking, setPicking] = useState<string | null>(null);
  const pickSlot = picking ? model.rows.slots.find((s) => s.id === picking) : undefined;
  const pickAssignment = picking ? model.bySlot.get(picking) : undefined;
  const pickEvent = pickSlot ? model.rows.events.find((e) => e.id === pickSlot.event_id) : undefined;
  return (
    <>
      <ScheduleList model={model} readOnly={readOnly} today={today} onPick={setPicking} />
      {pickSlot && pickAssignment && pickEvent && (
        <PersonPicker
          ctx={ctx}
          slot={pickSlot}
          assignment={pickAssignment}
          people={model.rows.people}
          history={index}
          title={slotState(pickAssignment) === 'open' ? 'Escalar' : 'Trocar pessoa'}
          roleName={model.roleName(pickSlot.job_role_id)}
          eventTitle={pickEvent.title}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}
