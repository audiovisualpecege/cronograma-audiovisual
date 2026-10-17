import { addDays, localDate } from '@cronograma/core';
import { useMemo } from 'react';
import { useTable, type AssignmentRow, type EventRow, type JobRoleRow, type PersonRow, type SlotRow } from '../../data/catalog';
import { useSyncEngine } from '../../sync/SyncProvider';
import { Button } from '../../ui/chiaro';
import { Dialog } from '../../ui/Dialog';
import { formatStamp } from '../../ui/format';

interface FutureAllocation {
  id: string;
  title: string;
  startsAt: string;
  role: string;
}

/** Alocações da pessoa em semanas ainda não arquivadas (a semana arquiva 7 dias depois da segunda). */
export function futureAllocations(
  personId: string,
  data: { assignments: readonly AssignmentRow[]; events: readonly EventRow[]; slots: readonly SlotRow[]; roles: readonly JobRoleRow[] },
  today: string,
): FutureAllocation[] {
  const events = new Map(data.events.map((e) => [e.id, e]));
  const slots = new Map(data.slots.map((s) => [s.id, s]));
  const roles = new Map(data.roles.map((r) => [r.id, r.name]));
  return data.assignments
    .filter((a) => a.person_id === personId)
    .flatMap((a) => {
      const e = events.get(a.event_id);
      if (!e || addDays(e.week_start, 7) <= today) return [];
      const slot = slots.get(a.slot_id);
      return [{ id: a.id, title: e.title, startsAt: e.starts_at, role: slot ? (roles.get(slot.job_role_id) ?? '') : '' }];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

interface Props {
  person: PersonRow;
  onCancel: () => void;
  onDone: () => void;
}

export function DeactivateDialog({ person, onCancel, onDone }: Props) {
  const engine = useSyncEngine();
  const assignments = useTable<AssignmentRow>('assignments');
  const events = useTable<EventRow>('events');
  const slots = useTable<SlotRow>('slots');
  const roles = useTable<JobRoleRow>('job_roles');
  const loaded = assignments && events && slots && roles;
  const list = useMemo(
    () => (loaded ? futureAllocations(person.id, { assignments, events, slots, roles }, localDate(new Date())) : []),
    [loaded, person.id, assignments, events, slots, roles],
  );

  async function confirm() {
    await engine.enqueue('person.deactivate', { id: person.id }, { target: { table: 'people', id: person.id, changes: { active: false } } });
    onDone();
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title={`Desativar ${person.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => void confirm()} disabled={!loaded}>
            Desativar pessoa
          </Button>
        </>
      }
    >
      <p>A pessoa perde o acesso e sai das opções de escala. O histórico continua com o nome dela, marcado como inativo.</p>
      {loaded && list.length === 0 && <p>Ela não tem alocações nas próximas semanas.</p>}
      {list.length > 0 && (
        <>
          <p>Estas alocações viram vagas abertas, marcadas como alterações não publicadas:</p>
          <ul className="plain-list" aria-label="Alocações futuras">
            {list.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong> {formatStamp(a.startsAt)}
                {a.role && <span className="list-row-sub"> {a.role}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
