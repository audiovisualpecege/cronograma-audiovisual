import { memo, useMemo, useState } from 'react';
import type { CalendarSourceRow, CrewRow, EventRow, JobRoleRow, ServiceTypeRow } from '../data/catalog';
import type { SyncEngine } from '../sync/syncEngine';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { formatStamp } from '../ui/format';
import { Select } from '../ui/Select';
import { PenIcon } from '@solar-icons/react/linear';
import { HighlightToggle } from './HighlightToggle';
import { AppIcon } from '../ui/AppIcon';
import { typeIcon } from '../ui/typeIcons';
import { CERTAINTY_LABEL, estimatedCrew, eventsByDay, eventSpan, isMarker, markersLast, weekDays, type WeekRows } from './model';
import { EventSeals } from './ScheduleList';
import { Seal } from './Seal';

export const NO_EVENTS = 'Nenhum evento nesta semana';

/** Avisos de agenda desconectada: a prévia continua com os últimos dados lidos (US-010 EC-10). */
export function SourceAlerts({ sources }: { sources: readonly CalendarSourceRow[] }) {
  const broken = sources.filter((s) => s.enabled && s.status === 'error');
  if (broken.length === 0) return null;
  return (
    <div className="source-alerts">
      {broken.map((s) => (
        <p key={s.id} className="form-message form-message--alert" role="alert">
          Agenda {s.label} desconectada desde {formatStamp(s.last_synced_at ?? s.updated_at)}. Mostrando os últimos dados lidos.
        </p>
      ))}
    </div>
  );
}

const TYPE_UNDEFINED = '';

/** Troca o tipo de serviço do evento pela fila; o tipo escolhido à mão vale com certeza alta. */
export function changeType(engine: SyncEngine, e: EventRow, typeId: string | null) {
  const changes = { service_type_id: typeId, type_certainty: typeId ? 'alta' : 'baixa', type_source: 'admin' };
  return engine.enqueue('event.update_extras', { id: e.id, service_type_id: typeId }, { baseVersion: e.version, target: { table: 'events', id: e.id, changes } });
}

interface RowProps {
  event: EventRow;
  types: readonly ServiceTypeRow[];
  crew: readonly CrewRow[];
  roles: ReadonlyMap<string, JobRoleRow>;
  sourceLabel: string;
  today: string;
  readOnly: boolean;
  pending: boolean;
  /** Destaca o evento sem tipo (passo 1 da proposta). */
  highlight: boolean;
  /** Tipo sugerido pelo histórico para o evento sem tipo. */
  suggestion?: ServiceTypeRow;
  onType: (e: EventRow, typeId: string | null) => void;
  /** Abre os detalhes numa janela, em vez de ir para a página do evento. */
  onOpen?: (e: EventRow) => void;
}

/** Uma linha da prévia; memorizada para semanas com 100 eventos ou mais (US-010 EC-8). */
const PreviewEvent = memo(function PreviewEvent({ event, types, crew, roles, sourceLabel, today, readOnly, pending, highlight, suggestion, onType, onOpen }: RowProps) {
  const [editing, setEditing] = useState(false);
  // Funções na ordem do código (R1, R2...), como no cadastro do tipo.
  const code = (id: string) => roles.get(id)?.code ?? '';
  const estimated = [...estimatedCrew(event, types, crew)].sort((a, b) => code(a.job_role_id).localeCompare(code(b.job_role_id), 'en', { numeric: true }));
  const type = types.find((t) => t.id === event.service_type_id);
  // O seletor só nasce quando a pessoa vai trocar: semanas com 100 eventos ou mais abrem sem travar.
  const options = editing
    ? [{ value: TYPE_UNDEFINED, label: 'a definir' }, ...types.filter((t) => !t.archived_at || t.id === event.service_type_id).map((t) => ({ value: t.id, label: t.name }))]
    : [];
  const noTeam = event.no_team || types.find((t) => t.id === event.service_type_id)?.no_team;
  const missing = highlight && !event.service_type_id && event.status !== 'cancelled';
  const marker = isMarker(event, types);
  const titleClass = `list-row-title${event.status === 'cancelled' ? ' is-cancelled' : ''}`;
  return (
    <li
      className={`preview-event${missing ? ' is-missing' : ''}${marker ? ' is-marker' : ''}${event.highlighted ? ' is-highlighted' : ''}`}
      aria-label={event.title || 'Sem título'}
    >
      <HighlightToggle event={event} readOnly={readOnly} />
      <span className="list-row-main">
        {onOpen ? (
          <button type="button" className={`${titleClass} title-button`} onClick={() => onOpen(event)}>
            {event.title || 'Sem título'}
          </button>
        ) : (
          <a className={titleClass} href={`#/evento/${event.id}`}>
            {event.title || 'Sem título'}
          </a>
        )}
        <span className="list-row-sub">
          {eventSpan(event)}
          {event.location ? `, ${event.location}` : ''}. {event.origin === 'internal' ? 'Atividade interna' : `Agenda ${sourceLabel}`}
        </span>
        <span className="list-row-sub" aria-label="Equipe estimada">
          {noTeam ? 'Não exige equipe' : estimated.length === 0 ? 'Sem equipe estimada' : `Equipe estimada: ${estimated.map((c) => `${c.quantity} ${roles.get(c.job_role_id)?.name ?? 'Função'}`).join(', ')}`}
        </span>
      </span>
      <span className="list-row-tags">
        <EventSeals event={event} today={today} />
        {!event.service_type_id && <Seal kind="soft">a definir</Seal>}
        {event.type_certainty && <Seal>{CERTAINTY_LABEL[event.type_certainty]}</Seal>}
        {pending && <Seal>a enviar</Seal>}
      </span>
      {editing ? (
        <Select
          label="Tipo de serviço"
          aria-label={`Tipo de serviço de ${event.title || 'Sem título'}`}
          value={event.service_type_id ?? TYPE_UNDEFINED}
          options={options}
          autoFocus
          onChange={(e) => {
            onType(event, e.target.value || null);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          style={{ minWidth: 200 }}
        />
      ) : (
        <span className="preview-type">
          {type ? (
            <span className="type-chip">
              <span className="type-icon type-icon--sm">
                <AppIcon icon={typeIcon(type).icon} size={18} />
              </span>
              <strong className="type-name">{type.name}</strong>
              {!readOnly && event.status !== 'cancelled' && (
                // Botão simples, sem estado: a prévia tem 100 eventos ou mais (US-010 EC-8).
                <button type="button" className="pen-button" onClick={() => setEditing(true)} aria-label={`Trocar o tipo de ${event.title || 'Sem título'}`} title="Trocar o tipo">
                  <AppIcon icon={PenIcon} size={16} />
                </button>
              )}
            </span>
          ) : (
            <>
              <span className="list-row-sub">Tipo a definir</span>
              {!readOnly && event.status !== 'cancelled' && (
                <button type="button" className="text-button" onClick={() => setEditing(true)} aria-label={`Trocar o tipo de ${event.title || 'Sem título'}`}>
                  Escolher tipo
                </button>
              )}
            </>
          )}
          {!readOnly && suggestion && !event.service_type_id && (
            <button type="button" className="text-button" onClick={() => onType(event, suggestion.id)} aria-label={`Usar ${suggestion.name} em ${event.title || 'Sem título'}`}>
              Usar {suggestion.name}, sugerido pelo histórico
            </button>
          )}
        </span>
      )}
    </li>
  );
});

interface PreviewListProps {
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  today: string;
  readOnly: boolean;
  /** Destaca os eventos sem tipo. */
  highlight?: boolean;
  /** Tipo sugerido pelo histórico, por evento. */
  suggestions?: ReadonlyMap<string, ServiceTypeRow>;
  onOpenEvent?: (e: EventRow) => void;
}

/**
 * Eventos da semana sem montagem por dia (US-010): origem, tipo previsto, certeza e equipe estimada, com
 * a troca de tipo. Só eventos com tipo ganham vagas ao montar.
 */
export function PreviewList({ rows, sources, today, readOnly, highlight = false, suggestions, onOpenEvent }: PreviewListProps) {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const roles = useMemo(() => new Map(rows.roles.map((r) => [r.id, r])), [rows.roles]);
  const sourceLabels = useMemo(() => new Map(sources.map((s) => [s.id, s.label])), [sources]);
  const visible = useMemo(() => rows.events.filter((e) => !e.ignored), [rows.events]);
  const byDay = useMemo(() => eventsByDay(rows.weekStart, visible), [rows.weekStart, visible]);
  const onType = useMemo(() => (e: EventRow, typeId: string | null) => void changeType(engine, e, typeId), [engine]);

  return (
    <div className="week-preview">
      {weekDays(rows.weekStart).map((day) => {
        const events = markersLast(byDay.get(day.date) ?? [], rows.types);
        if (events.length === 0) return null;
        return (
          <section key={day.date} className="day-group" aria-label={day.label}>
            <h3 className="day-title">
              {day.label} {day.date === today && <Seal kind="hoje">hoje</Seal>}
            </h3>
            <ul className="plain-list preview-list">
              {events.map((e) => (
                <PreviewEvent
                  key={`${day.date}:${e.id}`}
                  event={e}
                  types={rows.types}
                  crew={rows.crew}
                  roles={roles}
                  sourceLabel={sourceLabels.get(e.calendar_source_id ?? '') ?? ''}
                  today={today}
                  readOnly={readOnly}
                  pending={pendingRows.has(`events:${e.id}`)}
                  highlight={highlight}
                  suggestion={suggestions?.get(e.id)}
                  onType={onType}
                  onOpen={onOpenEvent}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
