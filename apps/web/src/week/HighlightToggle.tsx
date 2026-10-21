import { StarIcon as StarOn } from '@solar-icons/react/bold';
import { StarIcon as StarOff } from '@solar-icons/react/linear';
import type { EventRow } from '../data/catalog';
import { useSyncEngine } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';

/**
 * Estrela de "atividade principal da semana", marcada por quem monta a escala. Fica gravada no evento
 * (events.highlighted); o jeito de mostrar no cronograma final ainda vai ser definido.
 */
export function HighlightToggle({ event, readOnly }: { event: EventRow; readOnly: boolean }) {
  const engine = useSyncEngine();
  const on = Boolean(event.highlighted);
  const title = event.title || 'Sem título';
  const label = on ? `Tirar o destaque de ${title}` : `Destacar ${title} como atividade principal`;
  const disabled = readOnly || event.status === 'cancelled';
  if (disabled && !on) return null;
  return (
    <button
      type="button"
      className={`star-toggle${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() =>
        void engine.enqueue(
          'event.update_extras',
          { id: event.id, highlighted: !on },
          { baseVersion: event.version, target: { table: 'events', id: event.id, changes: { highlighted: !on } } },
        )
      }
    >
      <AppIcon icon={on ? StarOn : StarOff} size={20} />
    </button>
  );
}
