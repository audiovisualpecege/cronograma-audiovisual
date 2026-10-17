import { checkEligibility, personLoad, rankCandidates, type HistoryIndex, type WeekContext } from '@cronograma/core';
import { useMemo, useState } from 'react';
import type { AssignmentRow, PersonRow, SlotRow } from '../data/catalog';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button, Tag } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { activitiesText, BLOCKER_LABEL, hoursText, WARNING_LABEL } from './model';
import { setPerson } from './useWeek';

interface Choice {
  person: PersonRow;
  hours: number;
  count: number;
  hist: number;
  warnings: string[];
  blockers: string[];
}

/**
 * Aptos primeiro, na ordem de `rankCandidates` (ADR-002), com horas e atividades na semana; depois as outras
 * pessoas ativas com o alerta ou o bloqueio. Pessoa inativa não aparece (US-015 EC-2).
 */
export function pickerChoices(ctx: WeekContext, slotId: string, people: readonly PersonRow[], history: HistoryIndex, currentId: string | null): { apt: Choice[]; others: Choice[] } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const ranked = rankCandidates(slotId, ctx, history);
  const apt: Choice[] = [];
  for (const c of ranked) {
    const person = byId.get(c.personId);
    if (!person || !person.active || person.id === currentId) continue;
    apt.push({ person, hours: c.loadHours, count: c.loadCount, hist: c.hist, warnings: [], blockers: [] });
  }
  const aptIds = new Set(ranked.map((c) => c.personId));
  const slot = ctx.slots.find((s) => s.id === slotId);
  const event = ctx.events.find((e) => e.id === slot?.eventId);
  const others: Choice[] = people
    .filter((p) => p.active && !aptIds.has(p.id) && p.id !== currentId)
    .map((person) => {
      const elig = checkEligibility(person.id, slotId, ctx);
      const load = personLoad(person.id, ctx);
      return {
        person,
        hours: load.hours,
        count: load.count,
        hist: slot ? history.hist(person.id, slot.jobRoleId, event?.serviceTypeId) : 0,
        warnings: elig.warnings,
        blockers: elig.blockers,
      };
    })
    .sort((a, b) => a.blockers.length - b.blockers.length || a.warnings.length - b.warnings.length || a.person.name.localeCompare(b.person.name, 'pt-BR'));
  return { apt, others };
}

interface PersonPickerProps {
  ctx: WeekContext;
  slot: SlotRow;
  assignment: AssignmentRow;
  people: readonly PersonRow[];
  history: HistoryIndex;
  title: string;
  roleName: string;
  eventTitle: string;
  onClose: () => void;
}

export function PersonPicker({ ctx, slot, assignment, people, history, title, roleName, eventTitle, onClose }: PersonPickerProps) {
  const engine = useSyncEngine();
  const [pending, setPending] = useState<Choice | null>(null);
  const { apt, others } = useMemo(
    () => pickerChoices(ctx, slot.id, people, history, assignment.person_id),
    [ctx, slot.id, people, history, assignment.person_id],
  );

  async function choose(c: Choice, override: boolean) {
    if (c.warnings.length > 0 && !override) {
      setPending(c);
      return;
    }
    await setPerson(engine, assignment, c.person.id, c.warnings, override);
    onClose();
  }

  const row = (c: Choice) => (
    <li key={c.person.id} className="picker-item">
      <button type="button" className="picker-button" disabled={c.blockers.length > 0} onClick={() => void choose(c, false)} aria-label={c.person.name}>
        <span className="list-row-main">
          <span className="list-row-title">{c.person.name}</span>
          <span className="list-row-sub">
            {hoursText(c.hours)} e {activitiesText(c.count)} na semana
            {c.hist > 0 ? `. Fez esta função neste tipo ${c.hist === 1 ? '1 vez' : `${c.hist} vezes`}` : ''}
          </span>
        </span>
        <span className="list-row-tags">
          {c.blockers.map((b) => (
            <Tag key={b}>{BLOCKER_LABEL[b] ?? b}</Tag>
          ))}
          {c.warnings.map((w) => (
            <Tag key={w}>{WARNING_LABEL[w] ?? w}</Tag>
          ))}
        </span>
      </button>
    </li>
  );

  return (
    <Dialog open onClose={onClose} title={title} width={600}>
      <p style={{ marginTop: 0 }}>
        {roleName} em {eventTitle}.
      </p>
      {pending ? (
        <div role="alertdialog" aria-label="Alerta da escala" className="override-box">
          <p className="form-message form-message--alert" role="alert">
            {pending.person.name}: {pending.warnings.map((w) => WARNING_LABEL[w] ?? w).join(', ')}. A alocação fica com o selo do alerta.
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setPending(null)}>
              Escolher outra pessoa
            </Button>
            <Button onClick={() => void choose(pending, true)}>Escalar mesmo assim</Button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="section-title">Aptos</h3>
          {apt.length === 0 ? <p className="form-text">Ninguém apto para esta vaga.</p> : <ul className="plain-list picker-list" aria-label="Aptos">{apt.map(row)}</ul>}
          {others.length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 'var(--space-5)' }}>
                Outras pessoas
              </h3>
              <ul className="plain-list picker-list" aria-label="Outras pessoas">
                {others.map(row)}
              </ul>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
