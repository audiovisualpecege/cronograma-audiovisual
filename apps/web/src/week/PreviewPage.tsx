import { isWeekPast } from '@cronograma/core';
import { memo, useMemo, useState } from 'react';
import type { CalendarSourceRow, CrewRow, EventRow, JobRoleRow, ServiceTypeRow } from '../data/catalog';
import { useLocalQuery, useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { Button, Card } from '../ui/chiaro';
import { formatStamp } from '../ui/format';
import { Select } from '../ui/Select';
import { CERTAINTY_LABEL, estimatedCrew, eventsByDay, eventSpan, roleBalance, weekDays, type WeekRows } from './model';
import { InternalEventForm } from '../event/InternalEventForm';
import { RoleBalancePanel } from './RoleBalancePanel';
import { EventSeals } from './ScheduleList';
import { Seal } from './Seal';
import { sendAndRefresh, WEEK_TABLES } from './useWeek';

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

interface RowProps {
  event: EventRow;
  types: readonly ServiceTypeRow[];
  crew: readonly CrewRow[];
  roles: ReadonlyMap<string, JobRoleRow>;
  sourceLabel: string;
  today: string;
  readOnly: boolean;
  pending: boolean;
  onType: (e: EventRow, typeId: string | null) => void;
}

/** Uma linha da prévia; memorizada para semanas com 100 eventos ou mais (US-010 EC-8). */
const PreviewEvent = memo(function PreviewEvent({ event, types, crew, roles, sourceLabel, today, readOnly, pending, onType }: RowProps) {
  const [editing, setEditing] = useState(false);
  // Funções na ordem do código (R1, R2...), como no cadastro do tipo.
  const code = (id: string) => roles.get(id)?.code ?? '';
  const estimated = [...estimatedCrew(event, types, crew)].sort((a, b) => code(a.job_role_id).localeCompare(code(b.job_role_id), 'en', { numeric: true }));
  const typeName = types.find((t) => t.id === event.service_type_id)?.name;
  // O seletor só nasce quando a pessoa vai trocar: semanas com 100 eventos ou mais abrem sem travar.
  const options = editing
    ? [{ value: TYPE_UNDEFINED, label: 'a definir' }, ...types.filter((t) => !t.archived_at || t.id === event.service_type_id).map((t) => ({ value: t.id, label: t.name }))]
    : [];
  const noTeam = event.no_team || types.find((t) => t.id === event.service_type_id)?.no_team;
  return (
    <li className="preview-event" aria-label={event.title || 'Sem título'}>
      <span className="list-row-main">
        <a className={`list-row-title${event.status === 'cancelled' ? ' is-cancelled' : ''}`} href={`#/evento/${event.id}`}>
          {event.title || 'Sem título'}
        </a>
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
          <span className="list-row-sub">{typeName ?? 'Tipo a definir'}</span>
          {!readOnly && event.status !== 'cancelled' && (
            <button type="button" className="text-button" onClick={() => setEditing(true)} aria-label={`Trocar o tipo de ${event.title || 'Sem título'}`}>
              Trocar tipo
            </button>
          )}
        </span>
      )}
    </li>
  );
});

interface PreviewProps {
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  now: Date;
  today: string;
}

/**
 * Prévia da semana sem montagem (US-010): eventos por dia com origem, tipo previsto, certeza e equipe
 * estimada; horas pedidas e disponíveis por função no topo; "Montar semana" pela fila (`week.build`).
 */
export function PreviewPage({ rows, sources, now, today }: PreviewProps) {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const past = isWeekPast(rows.weekStart, now);
  const building = useLocalQuery(
    async (store) => (await store.outbox.toArray()).some((op) => op.kind === 'week.build' && (op.payload as { week_start?: string }).week_start === rows.weekStart),
    [rows.weekStart],
  );
  const roles = useMemo(() => new Map(rows.roles.map((r) => [r.id, r])), [rows.roles]);
  const sourceLabels = useMemo(() => new Map(sources.map((s) => [s.id, s.label])), [sources]);
  const balance = useMemo(() => roleBalance(rows, 'preview'), [rows]);
  const visible = useMemo(() => rows.events.filter((e) => !e.ignored), [rows.events]);
  const byDay = useMemo(() => eventsByDay(rows.weekStart, visible), [rows.weekStart, visible]);
  const live = visible.filter((e) => e.status !== 'cancelled');
  const [creating, setCreating] = useState(false);

  function changeType(e: EventRow, typeId: string | null) {
    const changes = { service_type_id: typeId, type_certainty: typeId ? 'alta' : 'baixa', type_source: 'admin' };
    void engine.enqueue('event.update_extras', { id: e.id, service_type_id: typeId }, { baseVersion: e.version, target: { table: 'events', id: e.id, changes } });
  }

  async function build() {
    await engine.enqueue('week.build', { week_start: rows.weekStart });
    await sendAndRefresh(engine, WEEK_TABLES);
  }

  return (
    <div className="week-preview">
      <SourceAlerts sources={sources} />
      {!past && (
        <div className="week-actions-buttons">
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            Nova atividade interna
          </Button>
        </div>
      )}
      {creating && <InternalEventForm defaultDate={rows.weekStart} types={rows.types} onClose={() => setCreating(false)} />}
      {live.length === 0 ? (
        <Card variant="raised" padding={24}>
          <p className="form-text" style={{ margin: 0 }}>
            {NO_EVENTS}.
          </p>
        </Card>
      ) : (
        <>
          <RoleBalancePanel balance={balance} roleName={(id) => roles.get(id)?.name ?? 'Função'} />
          <div className="week-actions">
            <p className="form-text" style={{ margin: 0 }}>
              {live.length === 1 ? '1 evento' : `${live.length} eventos`} nesta semana. Revise os tipos antes de montar: só eventos com tipo ganham vagas.
            </p>
            {past ? (
              <p className="form-text">Semana passada fica só para consulta.</p>
            ) : building ? (
              <Seal>montagem a enviar</Seal>
            ) : (
              <Button onClick={() => void build()}>Montar semana</Button>
            )}
          </div>
        </>
      )}
      {weekDays(rows.weekStart).map((day) => {
        const events = byDay.get(day.date) ?? [];
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
                  readOnly={past}
                  pending={pendingRows.has(`events:${e.id}`)}
                  onType={changeType}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
