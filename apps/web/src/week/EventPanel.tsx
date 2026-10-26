import { CloseIcon } from '@solar-icons/react/linear';
import { localDate, type EventSize } from '@cronograma/core';
import { useEffect } from 'react';
import type { CalendarSourceRow, EventRow } from '../data/catalog';
import { navigate } from '../router';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { IconButton } from '../ui/IconButton';
import { Select } from '../ui/Select';
import { shortTitle } from './board';
import { EventSeals } from './EventSeals';
import { HighlightToggle } from './HighlightToggle';
import { activeSlots, CERTAINTY_LABEL, estimatedCrew, eventSpan, sizedType, slotState, weekDays, type WeekRows } from './model';
import { changeSize, changeType, SizeLine } from './PreviewPage';

/** A descrição do Google vem às vezes em HTML: quebras de linha viram linhas e as marcações saem. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const UNDEFINED_TYPE = '';

interface Props {
  event: EventRow;
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  today: string;
  readOnly: boolean;
  onClose: () => void;
}

/**
 * Detalhes do evento num painel à direita, sem sair da grade: quando, onde, tipo e porte (que mudam as vagas), a
 * equipe e a descrição da agenda. O resto (vaga a mais, observação, cancelar) fica na página do evento.
 */
export function EventPanel({ event, rows, sources, today, readOnly, onClose }: Props) {
  const engine = useSyncEngine();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const day = localDate(new Date(event.starts_at));
  const dayLabel = weekDays(rows.weekStart).find((d) => d.date === day)?.label ?? day.split('-').reverse().join('/');
  const type = rows.types.find((t) => t.id === event.service_type_id);
  const sized = sizedType(event, rows.types);
  const role = (id: string) => rows.roles.find((r) => r.id === id)?.name ?? 'Função';
  const person = (id: string | null | undefined) => rows.people.find((p) => p.id === id)?.name;
  const slots = activeSlots(rows).filter((s) => s.event_id === event.id);
  const bySlot = new Map(rows.assignments.map((a) => [a.slot_id, a]));
  const estimated = estimatedCrew(event, rows.types, rows.crew);
  const source = sources.find((s) => s.id === event.calendar_source_id)?.label;
  const editable = !readOnly && event.status !== 'cancelled';
  const title = shortTitle(event.title);

  return (
    <aside className="event-panel" aria-label={`Detalhes de ${shortTitle(title)}`}>
      <header className="event-panel-head">
        <HighlightToggle event={event} readOnly={readOnly} />
        <h2 className="event-panel-title">{shortTitle(title)}</h2>
        <IconButton icon={CloseIcon} label="Fechar os detalhes" onClick={onClose} size={36} />
      </header>
      <span className="list-row-tags">
        <EventSeals event={event} today={today} />
      </span>
      <dl className="field-list">
        <dt>Quando</dt>
        <dd>
          {dayLabel}, {eventSpan(event)}
        </dd>
        {event.location && (
          <>
            <dt>Local</dt>
            <dd>{event.location}</dd>
          </>
        )}
        <dt>Origem</dt>
        <dd>{event.origin === 'internal' ? 'Atividade interna' : `Agenda ${source ?? ''}`.trim()}</dd>
        <dt>Tipo</dt>
        <dd>
          {editable ? (
            <Select
              label="Tipo de serviço"
              aria-label={`Tipo de serviço de ${title}`}
              value={event.service_type_id ?? UNDEFINED_TYPE}
              options={[
                { value: UNDEFINED_TYPE, label: 'a definir' },
                ...rows.types.filter((t) => !t.archived_at || t.id === event.service_type_id).map((t) => ({ value: t.id, label: t.name })),
              ]}
              onChange={(e) => void changeType(engine, event, e.target.value || null)}
            />
          ) : (
            (type?.name ?? 'A definir')
          )}
          {type && event.type_certainty && <span className="list-row-sub"> {CERTAINTY_LABEL[event.type_certainty]}</span>}
        </dd>
        {sized && (
          <>
            <dt>Porte</dt>
            <dd>
              <SizeLine event={event} type={sized} readOnly={!editable} onSize={(e, size: EventSize) => void changeSize(engine, e, size)} />
            </dd>
          </>
        )}
        <dt>Equipe</dt>
        <dd>
          {slots.length > 0 ? (
            <ul className="plain-list quick-view-crew">
              {slots.map((s) => {
                const a = bySlot.get(s.id);
                const state = slotState(a);
                return (
                  <li key={s.id} className={state === 'open' ? 'is-open' : undefined}>
                    <span className="slot-role">{role(s.job_role_id)}</span> {state === 'open' ? 'vaga aberta' : person(a?.person_id)}
                    {state === 'proposed' ? ' (proposta)' : ''}
                  </li>
                );
              })}
            </ul>
          ) : estimated.length > 0 ? (
            `Prevista: ${estimated.map((c) => `${c.quantity} ${role(c.job_role_id)}`).join(', ')}`
          ) : (
            'Não exige equipe'
          )}
        </dd>
        {event.notes && (
          <>
            <dt>Observação</dt>
            <dd>{event.notes}</dd>
          </>
        )}
      </dl>
      {event.description && (
        <>
          <h3 className="field-label">Descrição na agenda</h3>
          <p className="quick-view-description">{plainText(event.description)}</p>
        </>
      )}
      <Button variant="secondary" size="sm" onClick={() => navigate(`/evento/${event.id}`)}>
        Abrir a página do evento
      </Button>
    </aside>
  );
}
