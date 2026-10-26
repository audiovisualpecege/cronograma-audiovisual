import { checkEligibility, nameTokens, personLoad, rankCandidates, type HistoryIndex, type WeekContext } from '@cronograma/core';
import { useMemo, useState } from 'react';
import type { AssignmentRow, PersonRow, SlotRow } from '../data/catalog';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button, Tag } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { historyReason } from './historyProposal';
import { activitiesText, BLOCKER_LABEL, hoursText, WARNING_LABEL } from './model';
import { setPerson } from './useWeek';

interface Choice {
  person: PersonRow;
  hours: number;
  count: number;
  /** Por que serve: a turma fixa ou o histórico, com a última vez. */
  reason: string;
  warnings: string[];
  blockers: string[];
}

/**
 * Aptos primeiro, na ordem de `rankCandidates` (ADR-002), com o motivo, horas e atividades na semana; depois as
 * outras pessoas ativas com o alerta ou o bloqueio. Pessoa inativa não aparece (US-015 EC-2).
 */
export function pickerChoices(ctx: WeekContext, slotId: string, people: readonly PersonRow[], history: HistoryIndex, currentId: string | null): { apt: Choice[]; others: Choice[] } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const ranked = rankCandidates(slotId, ctx, history);
  const apt: Choice[] = [];
  for (const c of ranked) {
    const person = byId.get(c.personId);
    if (!person || !person.active || person.id === currentId) continue;
    apt.push({ person, hours: c.loadHours, count: c.loadCount, reason: historyReason(ctx, history, slotId, c), warnings: [], blockers: [] });
  }
  const aptIds = new Set(ranked.map((c) => c.personId));
  const slot = ctx.slots.find((s) => s.id === slotId);
  const event = ctx.events.find((e) => e.id === slot?.eventId);
  const others: Choice[] = people
    .filter((p) => p.active && !aptIds.has(p.id) && p.id !== currentId)
    .map((person) => {
      const elig = checkEligibility(person.id, slotId, ctx);
      const load = personLoad(person.id, ctx);
      const hist = slot ? history.hist(person.id, slot.jobRoleId, event?.serviceTypeId) : 0;
      return {
        person,
        hours: load.hours,
        count: load.count,
        reason: hist > 0 ? historyReason(ctx, history, slotId, { personId: person.id, hist }) : '',
        warnings: elig.warnings,
        blockers: elig.blockers,
      };
    })
    .sort((a, b) => a.blockers.length - b.blockers.length || a.warnings.length - b.warnings.length || a.person.name.localeCompare(b.person.name, 'pt-BR'));
  return { apt, others };
}

/** Busca pelo começo dos nomes, sem acento: "lu so" acha "Luíza Souza"; "ana" acha "Ana Lima" e não "Mariana". */
function matches(person: PersonRow, query: string): boolean {
  const q = nameTokens(query);
  if (q.length === 0) return true;
  const words = nameTokens(person.name);
  return q.every((t) => words.some((w) => w.startsWith(t)));
}

interface PersonPickerProps {
  ctx: WeekContext;
  slot: SlotRow;
  /** A alocação da vaga; numa vaga prevista (semana sem montagem) a escolha vai para `onChoose`. */
  assignment: AssignmentRow | undefined;
  people: readonly PersonRow[];
  history: HistoryIndex;
  title: string;
  roleName: string;
  eventTitle: string;
  onClose: () => void;
  /** Recebe a escolha em vez de gravar na vaga (vaga prevista, gravada depois da montagem). */
  onChoose?: (personId: string, warnings: string[], override: boolean) => void;
}

export function PersonPicker({ ctx, slot, assignment, people, history, title, roleName, eventTitle, onClose, onChoose }: PersonPickerProps) {
  const engine = useSyncEngine();
  const [pending, setPending] = useState<Choice | null>(null);
  const [query, setQuery] = useState('');
  const currentId = assignment?.person_id ?? null;
  const { apt, others } = useMemo(() => pickerChoices(ctx, slot.id, people, history, currentId), [ctx, slot.id, people, history, currentId]);
  const shownApt = apt.filter((c) => matches(c.person, query));
  const shownOthers = others.filter((c) => matches(c.person, query));

  async function choose(c: Choice, override: boolean) {
    if (c.warnings.length > 0 && !override) {
      setPending(c);
      return;
    }
    if (onChoose) onChoose(c.person.id, c.warnings, override);
    else if (assignment) await setPerson(engine, assignment, c.person.id, c.warnings, override);
    onClose();
  }

  const row = (c: Choice) => (
    <li key={c.person.id} className="picker-item">
      <button type="button" className="picker-button" disabled={c.blockers.length > 0} onClick={() => void choose(c, false)} aria-label={c.person.name}>
        <span className="list-row-main">
          <span className="list-row-title">{c.person.name}</span>
          <span className="list-row-sub">
            {c.reason ? `${c.reason}. ` : ''}
            {hoursText(c.hours)} e {activitiesText(c.count)} na semana
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
        {roleName} em {eventTitle.split(/\r?\n/)[0]}.
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
          <input
            type="search"
            className="picker-search"
            placeholder="Buscar pelo nome"
            aria-label="Buscar pelo nome"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <h3 className="section-title">Podem</h3>
          {shownApt.length === 0 ? (
            <p className="form-text">{apt.length === 0 ? 'Ninguém apto para esta vaga.' : 'Ninguém apto com esse nome.'}</p>
          ) : (
            <ul className="plain-list picker-list" aria-label="Aptos">
              {shownApt.map(row)}
            </ul>
          )}
          {shownOthers.length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 'var(--space-5)' }}>
                Não podem ou com alerta
              </h3>
              <ul className="plain-list picker-list picker-list--others" aria-label="Outras pessoas">
                {shownOthers.map(row)}
              </ul>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
