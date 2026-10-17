import { daysOf } from '@cronograma/core';
import type { EventRow } from '../data/catalog';
import { Card } from '../ui/chiaro';
import { needsTeam, slotState, weekDays } from './model';
import type { ScheduleModel } from './schedule';
import { Seal } from './Seal';

interface GridItem {
  slotId: string;
  event: EventRow;
  role: string;
  state: 'open' | 'proposed' | 'confirmed';
  warned: boolean;
}

/** Alocações (propostas e confirmadas) de cada pessoa em cada dia, e as vagas abertas por dia. */
export function gridCells(model: ScheduleModel): { byPerson: Map<string, Map<string, GridItem[]>>; open: Map<string, GridItem[]> } {
  const byPerson = new Map<string, Map<string, GridItem[]>>();
  const open = new Map<string, GridItem[]>();
  for (const e of model.events) {
    if (!needsTeam(e, model.rows.types)) continue;
    const days = daysOf({ startsAt: new Date(e.starts_at), endsAt: new Date(e.ends_at) });
    for (const s of model.slotsByEvent.get(e.id) ?? []) {
      const a = model.bySlot.get(s.id);
      const state = slotState(a);
      const item: GridItem = { slotId: s.id, event: e, role: model.roleName(s.job_role_id), state, warned: (a?.warnings ?? []).length > 0 };
      for (const day of days) {
        if (state === 'open') {
          open.set(day, [...(open.get(day) ?? []), item]);
        } else {
          const personId = a?.person_id as string;
          const row = byPerson.get(personId) ?? new Map<string, GridItem[]>();
          row.set(day, [...(row.get(day) ?? []), item]);
          byPerson.set(personId, row);
        }
      }
    }
  }
  return { byPerson, open };
}

interface GridProps {
  model: ScheduleModel;
  readOnly: boolean;
  today: string;
  onPick: (slotId: string) => void;
}

/**
 * Grade pessoa por dia (US-015 AC-5): tabela num Card de canto 18 px, cabeçalho fixo e células em
 * --surface-raised (TechSpec, casos que o design system não cobre).
 */
export function ScheduleGrid({ model, readOnly, today, onPick }: GridProps) {
  const days = weekDays(model.rows.weekStart);
  const { byPerson, open } = gridCells(model);
  const people = model.rows.people
    .filter((p) => p.active || byPerson.has(p.id))
    .sort((a, b) => Number(byPerson.has(b.id)) - Number(byPerson.has(a.id)) || a.name.localeCompare(b.name, 'pt-BR'));

  const chip = (item: GridItem, who: string) => (
    <button
      key={item.slotId}
      type="button"
      className={`grid-chip grid-chip--${item.state}${item.event.status === 'cancelled' ? ' is-cancelled' : ''}`}
      aria-label={`${who}: ${item.event.title}, ${item.role}`}
      disabled={readOnly || item.event.status === 'cancelled'}
      onClick={() => onPick(item.slotId)}
    >
      <span className="grid-chip-title">{item.event.title}</span>
      <span className="grid-chip-role">{item.role}</span>
      {item.state === 'proposed' && <Seal kind="proposta">proposta</Seal>}
      {item.warned && <Seal>alerta</Seal>}
    </button>
  );

  return (
    <Card variant="raised" padding={0} style={{ borderRadius: 18, overflow: 'hidden' }}>
      <div className="schedule-grid-scroll">
        <table className="schedule-grid" aria-label="Grade da semana por pessoa e dia">
          <thead>
            <tr>
              <th scope="col">Pessoa</th>
              {days.map((d) => (
                <th key={d.date} scope="col">
                  {d.short} {d.date === today && <Seal kind="hoje">hoje</Seal>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="schedule-grid-open">
              <th scope="row">Vagas abertas</th>
              {days.map((d) => (
                <td key={d.date}>{(open.get(d.date) ?? []).map((item) => chip(item, 'Vaga aberta'))}</td>
              ))}
            </tr>
            {people.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.name}</th>
                {days.map((d) => (
                  <td key={d.date}>{(byPerson.get(p.id)?.get(d.date) ?? []).map((item) => chip(item, p.name))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
