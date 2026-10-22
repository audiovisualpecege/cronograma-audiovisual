import { localDate } from '@cronograma/core';
import type { EventRow } from '../data/catalog';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button, Card } from '../ui/chiaro';
import { AltArrowDownIcon, AltArrowUpIcon } from '@solar-icons/react/linear';
import { useContext, useState } from 'react';
import { AppIcon } from '../ui/AppIcon';
import { IconButton } from '../ui/IconButton';
import { DraftContext } from './historyProposal';
import { HighlightToggle } from './HighlightToggle';
import { typeIcon } from '../ui/typeIcons';
import { eventsByDay, eventSpan, isMarker, markersLast, needsTeam, slotState, weekDays } from './model';
import type { ScheduleModel } from './schedule';
import { Seal } from './Seal';
import { SlotLine } from './SlotLine';
import { acceptProposal, discardProposal } from './useWeek';

/** Selos do evento: hoje, interna, mudou, cancelado e, para administradores, restaurado, duplicado e sem escala. */
export function EventSeals({ event, today, team = false }: { event: EventRow; today: string; team?: boolean }) {
  const first = localDate(new Date(event.starts_at));
  const last = localDate(new Date(Math.max(Date.parse(event.starts_at), Date.parse(event.ends_at) - 1)));
  return (
    <>
      {first <= today && today <= last && <Seal kind="hoje">hoje</Seal>}
      {event.origin === 'internal' && <Seal kind="soft">interna</Seal>}
      {event.status === 'changed' && <Seal kind="mudou">mudou</Seal>}
      {event.status === 'cancelled' && <Seal kind="cancelado">cancelado</Seal>}
      {!team && event.restored && <Seal>restaurado</Seal>}
      {!team && event.duplicate_group && <Seal>possível duplicado</Seal>}
      {!team && event.review_pending && event.status !== 'changed' && event.status !== 'cancelled' && <Seal>sem escala</Seal>}
    </>
  );
}

interface ListProps {
  model: ScheduleModel;
  readOnly: boolean;
  today: string;
  onPick: (slotId: string) => void;
  /** Abre os detalhes numa janela, em vez de ir para a página do evento. */
  onOpenEvent?: (e: EventRow) => void;
  /** Eventos começam recolhidos, com o resumo das vagas; a setinha mostra as pessoas. */
  collapsible?: boolean;
  /** Abre todos os eventos de uma vez. */
  expandAll?: boolean;
  /** Mostra só as vagas que passam no filtro (e só os eventos que têm alguma), já abertas. */
  slotFilter?: (slotId: string) => boolean;
}

/** Lista por evento, agrupada por dia (US-015 AC-5); férias, folga e reservas no fim de cada dia. */
export function ScheduleList({ model, readOnly, today, onPick, onOpenEvent, collapsible = false, expandAll = false, slotFilter }: ListProps) {
  const engine = useSyncEngine();
  const drafts = useContext(DraftContext);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const byDay = eventsByDay(model.rows.weekStart, model.events);
  const types = model.rows.types;
  const toggle = (id: string) =>
    setOpened((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** Vagas com alguém (confirmada ou proposta), com sugestão ainda não aceita e vazias. */
  const counts = (slotIds: readonly string[]) => {
    let filled = 0;
    let suggested = 0;
    for (const id of slotIds) {
      if (slotState(model.bySlot.get(id)) !== 'open') filled++;
      else if (drafts?.drafts.has(id)) suggested++;
    }
    return { filled, suggested, empty: slotIds.length - filled - suggested };
  };
  return (
    <div className="schedule-list">
      {weekDays(model.rows.weekStart).map((day) => {
        const events = markersLast(byDay.get(day.date) ?? [], types).filter(
          (e) => !slotFilter || (!isMarker(e, types) && (model.slotsByEvent.get(e.id) ?? []).some((s) => slotFilter(s.id))),
        );
        if (events.length === 0) return null;
        return (
          <section key={day.date} className="day-group" aria-label={day.label}>
            <h3 className="day-title">
              {day.label} {day.date === today && <Seal kind="hoje">hoje</Seal>}
            </h3>
            {events.map((e) => {
              const allSlots = model.slotsByEvent.get(e.id) ?? [];
              const slots = slotFilter ? allSlots.filter((s) => slotFilter(s.id)) : allSlots;
              const proposed = slots.map((s) => model.bySlot.get(s.id)).filter((a) => a && slotState(a) === 'proposed');
              const open = !collapsible || expandAll || Boolean(slotFilter) || opened.has(e.id);
              const c = counts(allSlots.map((s) => s.id));
              const type = types.find((t) => t.id === e.service_type_id);
              const titleClass = `schedule-event-title${e.status === 'cancelled' ? ' is-cancelled' : ''}`;
              if (isMarker(e, types)) {
                return (
                  <article key={`${day.date}:${e.id}`} className="marker-event" aria-label={e.title}>
                    <HighlightToggle event={e} readOnly={readOnly} />
                    <span className="type-icon type-icon--sm">
                      <AppIcon icon={typeIcon(type).icon} size={18} />
                    </span>
                    {onOpenEvent ? (
                      <button type="button" className="marker-title title-button" onClick={() => onOpenEvent(e)}>
                        {e.title || 'Sem título'}
                      </button>
                    ) : (
                      <a className="marker-title" href={`#/evento/${e.id}`}>
                        {e.title || 'Sem título'}
                      </a>
                    )}
                    <span className="list-row-sub">
                      {type?.name ?? 'Não exige equipe'}, {eventSpan(e)}
                    </span>
                  </article>
                );
              }
              return (
                <Card key={`${day.date}:${e.id}`} variant="raised" padding={16}>
                  <article className={`schedule-event${e.highlighted ? ' is-highlighted' : ''}`} aria-label={e.title}>
                    <header className="schedule-event-head">
                      {collapsible && allSlots.length > 0 && !slotFilter && !expandAll && (
                        <IconButton
                          icon={open ? AltArrowUpIcon : AltArrowDownIcon}
                          label={`${open ? 'Esconder' : 'Mostrar'} a equipe de ${e.title || 'Sem título'}`}
                          size={36}
                          aria-expanded={open}
                          onClick={() => toggle(e.id)}
                        />
                      )}
                      <HighlightToggle event={e} readOnly={readOnly} />
                      {onOpenEvent ? (
                        <button type="button" className={`${titleClass} title-button`} onClick={() => onOpenEvent(e)}>
                          {e.title || 'Sem título'}
                        </button>
                      ) : (
                        <a className={titleClass} href={`#/evento/${e.id}`}>
                          {e.title || 'Sem título'}
                        </a>
                      )}
                      <span className="list-row-sub">{eventSpan(e)}</span>
                      {type && (
                        <span className="type-chip">
                          <span className="type-icon type-icon--sm">
                            <AppIcon icon={typeIcon(type).icon} size={18} />
                          </span>
                          <strong className="type-name">{type.name}</strong>
                        </span>
                      )}
                      <span className="list-row-tags">
                        <EventSeals event={e} today={today} />
                      </span>
                      {collapsible && allSlots.length > 0 && (
                        <span className="slot-summary" aria-label="Situação das vagas">
                          <span className={c.empty === 0 && c.suggested === 0 ? 'is-done' : undefined}>
                            {c.filled}/{allSlots.length} preenchidas
                          </span>
                          {c.suggested > 0 && <span className="is-suggested">{c.suggested === 1 ? '1 sugestão' : `${c.suggested} sugestões`}</span>}
                          {c.empty > 0 && <span className="is-empty">{c.empty === 1 ? '1 vazia' : `${c.empty} vazias`}</span>}
                        </span>
                      )}
                    </header>
                    {!needsTeam(e, model.rows.types) && e.status !== 'cancelled' && <p className="form-text">Não exige equipe.</p>}
                    {needsTeam(e, model.rows.types) && allSlots.length === 0 && <p className="form-text">Sem vagas. Escolha o tipo de serviço ou adicione vagas no evento.</p>}
                    {open && slots.length > 0 && (
                      <ul className="plain-list slot-list">
                        {slots.map((s) => (
                          <SlotLine key={s.id} model={model} event={e} slot={s} readOnly={readOnly} onPick={onPick} />
                        ))}
                      </ul>
                    )}
                    {open && !readOnly && proposed.length > 0 && (
                      <div className="dialog-actions">
                        <Button size="sm" variant="ghost" onClick={() => proposed.forEach((a) => a && void discardProposal(engine, a))}>
                          Descartar as propostas do evento
                        </Button>
                        <Button size="sm" onClick={() => proposed.forEach((a) => a && void acceptProposal(engine, a))}>
                          Aceitar todas do evento
                        </Button>
                      </div>
                    )}
                  </article>
                </Card>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
