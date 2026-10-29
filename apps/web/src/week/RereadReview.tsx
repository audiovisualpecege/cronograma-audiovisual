import { localDate } from '@cronograma/core';
import { useEffect, useState } from 'react';
import { useTable, type EventRow } from '../data/catalog';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { shortTitle } from './board';
import { dayMonth, eventSpan } from './model';
import { hideEvent, unhideEvent } from './useWeek';

/** O que, de agora em diante, está diferente da agenda: apagado aqui e ainda na agenda, ou só no cronograma. */
export function agendaDifferences(events: readonly EventRow[], fromWeek: string) {
  const ahead = events.filter((e) => e.week_start >= fromWeek && e.status !== 'cancelled');
  const byTime = (a: EventRow, b: EventRow) => a.starts_at.localeCompare(b.starts_at);
  return {
    hidden: ahead.filter((e) => e.hidden_at && e.origin !== 'internal').sort(byTime),
    internal: ahead.filter((e) => e.origin === 'internal' && !e.ignored).sort(byTime),
  };
}

/**
 * Depois da releitura: os eventos apagados aqui que seguem na Google Agenda (ficam fora ou voltam) e as atividades
 * que só existem no cronograma (ficam ou saem). Sem diferença, não aparece.
 */
export function RereadReview({ fromWeek, onClose }: { fromWeek: string; onClose: () => void }) {
  const engine = useSyncEngine();
  const events = useTable<EventRow>('events');
  // O que já foi decidido sai da lista; "Trazer de volta" e "Apagar" saem sozinhos quando o evento muda.
  const [decided, setDecided] = useState<ReadonlySet<string>>(() => new Set());
  const [seen, setSeen] = useState(false);
  const diff = events ? agendaDifferences(events, fromWeek) : null;
  const hidden = (diff?.hidden ?? []).filter((e) => !decided.has(e.id));
  const internal = (diff?.internal ?? []).filter((e) => !decided.has(e.id));
  const total = hidden.length + internal.length;
  if (total > 0 && !seen) setSeen(true);
  // Sem diferença nenhuma depois da releitura, o aviso nem aparece.
  useEffect(() => {
    if (diff && total === 0 && !seen) onClose();
  }, [diff, total, seen, onClose]);
  if (!seen && total === 0) return null;
  const decide = (e: EventRow, act?: (engine: ReturnType<typeof useSyncEngine>, e: EventRow) => Promise<void>) => {
    setDecided((s) => new Set([...s, e.id]));
    if (act) void act(engine, e);
  };
  const when = (e: EventRow) => `${dayMonth(localDate(new Date(e.starts_at)))}, ${eventSpan(e)}`;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Diferenças com a agenda"
      footer={<Button onClick={onClose}>Pronto</Button>}
    >
      {hidden.length > 0 && (
        <section aria-label="Apagados aqui, ainda na agenda">
          <h3 className="field-label">Apagados aqui, ainda na agenda</h3>
          <ul className="plain-list reread-review">
            {hidden.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{shortTitle(e.title)}</strong> <span className="list-row-sub">{when(e)}</span>
                </span>
                <span className="reread-review-actions">
                  <Button variant="ghost" size="sm" onClick={() => decide(e)}>
                    Manter fora
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => decide(e, unhideEvent)}>
                    Trazer de volta
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {internal.length > 0 && (
        <section aria-label="Só no cronograma, fora da agenda">
          <h3 className="field-label">Só no cronograma, fora da agenda</h3>
          <ul className="plain-list reread-review">
            {internal.map((e) => (
              <li key={e.id}>
                <span>
                  <strong>{shortTitle(e.title)}</strong> <span className="list-row-sub">{when(e)}</span>
                </span>
                <span className="reread-review-actions">
                  <Button variant="ghost" size="sm" onClick={() => decide(e)}>
                    Manter
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => decide(e, hideEvent)}>
                    Apagar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {hidden.length + internal.length === 0 && <p style={{ margin: 0 }}>Tudo decidido.</p>}
    </Dialog>
  );
}
