import { localDate } from '@cronograma/core';
import type { CalendarSourceRow, EventRow } from '../data/catalog';
import { navigate } from '../router';
import { AppIcon } from '../ui/AppIcon';
import { Button } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { typeIcon } from '../ui/typeIcons';
import { activeSlots, CERTAINTY_LABEL, estimatedCrew, eventSpan, slotState, weekDays, type WeekRows } from './model';
import { EventSeals } from './ScheduleList';

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

interface Props {
  event: EventRow;
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  today: string;
  onClose: () => void;
}

/** Detalhes do evento numa janela, sem sair da tela (Propor escala). A página completa fica a um clique. */
export function EventQuickView({ event, rows, sources, today, onClose }: Props) {
  const day = localDate(new Date(event.starts_at));
  const dayLabel = weekDays(rows.weekStart).find((d) => d.date === day)?.label ?? day.split('-').reverse().join('/');
  const type = rows.types.find((t) => t.id === event.service_type_id);
  const role = (id: string) => rows.roles.find((r) => r.id === id)?.name ?? 'Função';
  const person = (id: string | null | undefined) => rows.people.find((p) => p.id === id)?.name;
  const slots = activeSlots(rows).filter((s) => s.event_id === event.id);
  const bySlot = new Map(rows.assignments.map((a) => [a.slot_id, a]));
  const estimated = estimatedCrew(event, rows.types, rows.crew);
  const source = sources.find((s) => s.id === event.calendar_source_id)?.label;

  return (
    <Dialog
      open
      onClose={onClose}
      title={event.title || 'Sem título'}
      width={600}
      footer={
        <>
          <Button variant="secondary" onClick={() => navigate(`/evento/${event.id}`)}>
            Abrir a página do evento
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </>
      }
    >
      <div className="quick-view">
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
            {type ? (
              <span className="type-chip">
                <span className="type-icon type-icon--sm">
                  <AppIcon icon={typeIcon(type).icon} size={18} />
                </span>
                <strong className="type-name">{type.name}</strong>
                {event.type_certainty && <span className="list-row-sub">{CERTAINTY_LABEL[event.type_certainty]}</span>}
              </span>
            ) : (
              'A definir'
            )}
          </dd>
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
              `Estimada: ${estimated.map((c) => `${c.quantity} ${role(c.job_role_id)}`).join(', ')}`
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
      </div>
    </Dialog>
  );
}
