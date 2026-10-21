import type { ReactNode } from 'react';
import type { AssignmentRow, EventRow, SlotRow } from '../data/catalog';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { slotState, WARNING_LABEL } from './model';
import type { ScheduleModel } from './schedule';
import { Seal } from './Seal';
import { acceptProposal, clearSlot, discardProposal, lockSlot } from './useWeek';

/** Selos de uma vaga: situação, alertas, trava e "a enviar". */
export function SlotSeals({ model, slot, assignment }: { model: ScheduleModel; slot: SlotRow; assignment: AssignmentRow | undefined }) {
  const { pendingRows } = useSyncState();
  const state = slotState(assignment);
  return (
    <>
      {state === 'open' && <Seal kind="soft">a definir</Seal>}
      {state === 'proposed' && <Seal kind="proposta">proposta</Seal>}
      {slot.extra && <Seal>vaga extra</Seal>}
      {(assignment?.warnings ?? []).map((w) => (
        <Seal key={w}>{WARNING_LABEL[w] ?? w}</Seal>
      ))}
      {assignment?.locked && <Seal>travada</Seal>}
      {state === 'open' && model.noApt.has(slot.id) && <Seal>ninguém apto</Seal>}
      {assignment && pendingRows.has(`assignments:${assignment.id}`) && <Seal>a enviar</Seal>}
    </>
  );
}

interface SlotLineProps {
  model: ScheduleModel;
  event: EventRow;
  slot: SlotRow;
  readOnly: boolean;
  onPick: (slotId: string) => void;
  /** Ação a mais da tela que usa a linha (remover vaga, no evento). */
  extra?: ReactNode;
}

/** Uma vaga com a pessoa, os selos e as ações da escala (US-014, US-015). */
export function SlotLine({ model, event, slot, readOnly, onPick, extra }: SlotLineProps) {
  const engine = useSyncEngine();
  const a = model.bySlot.get(slot.id);
  const state = slotState(a);
  const role = model.roleName(slot.job_role_id);
  const who = state === 'open' ? 'Vaga aberta' : model.personName(a?.person_id);
  const locked = event.status === 'cancelled' || readOnly || !a;
  // Vaga ainda sem ninguém fica em destaque, para saltar aos olhos na revisão da escala.
  const missing = state === 'open' && event.status !== 'cancelled';
  return (
    <li className={`slot-line${missing ? ' is-missing' : ''}`} aria-label={`${role}: ${who}`}>
      <span className="list-row-main">
        <span className="list-row-title">
          <span className="slot-role">{role}</span> {who}
        </span>
        {state === 'proposed' && a?.reason && <span className="list-row-sub">{a.reason}</span>}
        {state === 'open' && a?.reason && <span className="list-row-sub">{a.reason}</span>}
      </span>
      <span className="list-row-tags">
        <SlotSeals model={model} slot={slot} assignment={a} />
      </span>
      {!locked && a && (
        <span className="slot-actions">
          {state === 'open' && (
            <Button size="sm" variant="secondary" onClick={() => onPick(slot.id)}>
              Escalar
            </Button>
          )}
          {state === 'proposed' && (
            <>
              <Button size="sm" onClick={() => void acceptProposal(engine, a)}>
                Aceitar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onPick(slot.id)}>
                Trocar pessoa
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void discardProposal(engine, a)}>
                Descartar
              </Button>
            </>
          )}
          {state === 'confirmed' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => onPick(slot.id)}>
                Trocar pessoa
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void lockSlot(engine, a, !a.locked)}>
                {a.locked ? 'Destravar' : 'Travar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void clearSlot(engine, a)}>
                Desfazer
              </Button>
            </>
          )}
          {extra}
        </span>
      )}
    </li>
  );
}
