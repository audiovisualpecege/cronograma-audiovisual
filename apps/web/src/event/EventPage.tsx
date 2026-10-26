import { buildHistoryIndex, DEFAULT_SIZE, EVENT_SIZES, isWeekPast, localDate, localTime, NOTES_MAX, SIZE_LABEL, zonedTime } from '@cronograma/core';
import { useMemo, useState, type FormEvent } from 'react';
import { sizeFor, toFact, useTable, type CalendarSourceRow, type EventRow } from '../data/catalog';
import { useHistory } from '../data/history';
import { VALIDATION_MESSAGES } from '../data/messages';
import { PageTitle } from '../layout/PageTitle';
import type { RouteProps } from '../router';
import { useLocalQuery, useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { Button, Card, Checkbox, Input, Radio } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { dayMonth, eventSpan, needsTeam, slotState, weekContext, type WeekRows } from '../week/model';
import { PersonPicker } from '../week/PersonPicker';
import { scheduleModel } from '../week/schedule';
import { EventSeals } from '../week/ScheduleList';
import { SlotLine } from '../week/SlotLine';
import { sendAndRefresh, useNow, useWeekRows } from '../week/useWeek';
import { changeLines } from './changes';
import { InternalEventForm } from './InternalEventForm';
import { publishedWeek } from '../team/model';
import { useTeamRows } from '../team/useTeamWeek';
import { Seal } from '../week/Seal';

export { changeLines };

export const FIX_IN_CALENDAR = 'Corrija na Google Agenda';

/** Tela do evento: dados da agenda só leitura, dados extras, pendências, duplicados e vagas (US-011, US-012). */
export function EventPage({ params }: RouteProps) {
  const engine = useSyncEngine();
  const admin = engine.tables.includes('slots');
  const { lastSyncAt } = useSyncState();
  const id = params.id ?? '';
  const event = useLocalQuery(async (store) => ((await store.mirror('events').get(id)) as EventRow | undefined) ?? null, [id]);
  const rows = useWeekRows(event?.week_start ?? '');
  const sources = useTable<CalendarSourceRow>('calendar_sources') ?? [];
  const now = useNow();

  if (event === undefined || (event === null && !lastSyncAt)) {
    return (
      <section className="page">
        <p className="form-text">Abrindo o evento.</p>
      </section>
    );
  }
  if (event === null) {
    return (
      <section className="page">
        <PageTitle black="EVENTO" />
        <p className="form-text">Evento não encontrado. Ele pode ter saído da agenda ou não estar na sua semana publicada.</p>
      </section>
    );
  }

  const source = sources.find((s) => s.id === event.calendar_source_id);
  const past = isWeekPast(event.week_start, now);
  const editable = admin && !past && event.status !== 'cancelled';
  return (
    <section className="page event-page">
      <div className="page-head">
        <PageTitle light={dayMonth(localDate(new Date(event.starts_at)))} black={event.title || 'SEM TÍTULO'} />
        {admin && (
          <a className="text-link" href={`#/semana/${event.week_start}`}>
            Ver a semana
          </a>
        )}
      </div>
      <div className="tag-row" style={{ marginBottom: 'var(--space-4)' }}>
        <EventSeals event={event} today={localDate(now)} team={!admin} />
      </div>
      <div className="event-columns">
        <div className="event-main">
          <AgendaCard event={event} sourceLabel={source?.label} editable={editable} admin={admin} hasPeople={Boolean(rows?.assignments.some((a) => a.event_id === event.id && a.person_id))} types={rows?.types ?? []} />
          {admin && event.review_pending && <ReviewCard event={event} />}
          {admin && event.duplicate_group && <DuplicateCard event={event} sources={sources} />}
          {admin && rows && <ExtrasCard key={event.id} event={event} rows={rows} editable={editable} />}
          {!admin && <TeamCrewCard event={event} />}
        </div>
        {admin && rows && (
          <aside className="event-side">
            <SlotsCard event={event} rows={rows} readOnly={!editable} now={now} />
          </aside>
        )}
      </div>
    </section>
  );
}

/** Equipe: observações e quem está escalado, da fotografia publicada (ADR-011), sem nada para editar. */
function TeamCrewCard({ event }: { event: EventRow }) {
  const rows = useTeamRows(event.week_start);
  const activity = useMemo(() => (rows ? publishedWeek(rows).activities.find((a) => a.event.id === event.id) : undefined), [rows, event.id]);
  const notes = activity?.notes ?? event.notes;
  return (
    <>
      {notes && (
        <Card variant="raised" padding={20}>
          <section aria-labelledby="obs-title">
            <h2 id="obs-title" className="section-title">
              Observações
            </h2>
            <p className="form-text" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {notes}
            </p>
          </section>
        </Card>
      )}
      {activity && (
        <Card variant="raised" padding={20}>
          <section aria-labelledby="escalados-title">
            <h2 id="escalados-title" className="section-title">
              Escalados
            </h2>
            <ul className="plain-list" aria-label="Escalados">
              {activity.crew.map((c, i) => (
                <li key={`${c.roleId}:${c.personId ?? i}`}>
                  <span className="slot-role">{c.roleName}</span> {c.personName ?? <Seal kind="soft">a definir</Seal>}
                </li>
              ))}
            </ul>
          </section>
        </Card>
      )}
    </>
  );
}

function AgendaCard({ event, sourceLabel, editable, admin, hasPeople, types }: { event: EventRow; sourceLabel?: string; editable: boolean; admin: boolean; hasPeople: boolean; types: WeekRows['types'] }) {
  const engine = useSyncEngine();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const internal = event.origin === 'internal';

  async function cancel() {
    await engine.enqueue('event.internal_cancel', { id: event.id }, { baseVersion: event.version, target: { table: 'events', id: event.id, changes: { status: 'cancelled' } } });
    setCancelling(false);
    void sendAndRefresh(engine, ['events', 'assignments']);
  }

  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="agenda-title">
        <h2 id="agenda-title" className="section-title">
          {internal ? 'Atividade interna' : 'Dados da agenda'}
        </h2>
        <dl className="field-list">
          <dt>Título</dt>
          <dd className={event.status === 'cancelled' ? 'is-cancelled' : undefined}>{event.title || 'Sem título'}</dd>
          <dt>Horário</dt>
          <dd>
            {dayMonth(localDate(new Date(event.starts_at)))} {eventSpan(event)}
          </dd>
          <dt>Local</dt>
          <dd>{event.location || 'Sem local'}</dd>
          <dt>Descrição</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{event.description || 'Sem descrição'}</dd>
          {!internal && (
            <>
              <dt>Agenda</dt>
              <dd>{sourceLabel ?? 'Agenda'}</dd>
            </>
          )}
        </dl>
        {!internal && admin && (
          <p className="form-text" role="note">
            Horário, local, título e descrição vêm da Google Agenda e ficam só para leitura aqui. {FIX_IN_CALENDAR}.
          </p>
        )}
        {internal && editable && (
          <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Editar atividade
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>
              Cancelar atividade
            </Button>
          </div>
        )}
      </section>
      {editing && <InternalEventForm event={event} defaultDate={event.week_start} types={types} hasPeople={hasPeople} onClose={() => setEditing(false)} />}
      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancelar atividade"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(false)}>
              Voltar
            </Button>
            <Button onClick={() => void cancel()}>Cancelar atividade</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>A atividade fica riscada e as pessoas escaladas nela são liberadas.</p>
      </Dialog>
    </Card>
  );
}

function ReviewCard({ event }: { event: EventRow }) {
  const engine = useSyncEngine();
  const lines = changeLines(event);
  const text =
    event.status === 'cancelled'
      ? 'O evento saiu da Google Agenda. As alocações foram liberadas.'
      : lines.length > 0
        ? 'A Google Agenda mudou este evento. Confira a escala.'
        : event.restored
          ? 'O evento voltou à Google Agenda e está sem escala.'
          : 'Evento novo na agenda, ainda sem escala.';
  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="revisao-title" className="review-card">
        <h2 id="revisao-title" className="section-title">
          Mudança da agenda
        </h2>
        <p className="form-text">{text}</p>
        {lines.length > 0 && event.status !== 'cancelled' && (
          <table className="change-table" aria-label="Antes e depois">
            <thead>
              <tr>
                <th scope="col">Campo</th>
                <th scope="col">Antes</th>
                <th scope="col">Agora</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label}>
                  <th scope="row">{l.label}</th>
                  <td>{l.before}</td>
                  <td>{l.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <Button
            size="sm"
            onClick={() =>
              void engine.enqueue('event.mark_reviewed', { id: event.id }, { baseVersion: event.version, target: { table: 'events', id: event.id, changes: { review_pending: false } } })
            }
          >
            Marcar como revisado
          </Button>
        </div>
      </section>
    </Card>
  );
}

function DuplicateCard({ event, sources }: { event: EventRow; sources: readonly CalendarSourceRow[] }) {
  const engine = useSyncEngine();
  const others = useLocalQuery(
    async (store) =>
      ((await store.mirror('events').where('week_start').equals(event.week_start).toArray()) as unknown as EventRow[]).filter(
        (e) => e.duplicate_group === event.duplicate_group && e.id !== event.id,
      ),
    [event.week_start, event.duplicate_group, event.id],
  );
  const label = (e: EventRow) => (e.origin === 'internal' ? 'atividade interna' : `agenda ${sources.find((s) => s.id === e.calendar_source_id)?.label ?? ''}`);
  function resolve(keep: 'one' | 'both') {
    void engine.enqueue('event.resolve_duplicate', { id: event.id, keep }, { baseVersion: event.version, target: { table: 'events', id: event.id, changes: { duplicate_group: null } } });
    void sendAndRefresh(engine, ['events', 'slots', 'assignments']);
  }
  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="duplicado-title">
        <h2 id="duplicado-title" className="section-title">
          Possível duplicado
        </h2>
        <p className="form-text">Mesmo título e horário em outra origem. Este vem da {label(event)}.</p>
        <ul className="plain-list">
          {(others ?? []).map((o) => (
            <li key={o.id}>
              <a className="text-link" href={`#/evento/${o.id}`}>
                {o.title}
              </a>{' '}
              ({label(o)})
            </li>
          ))}
        </ul>
        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <Button size="sm" onClick={() => resolve('one')}>
            Manter só este
          </Button>
          <Button size="sm" variant="secondary" onClick={() => resolve('both')}>
            Manter os dois
          </Button>
        </div>
      </section>
    </Card>
  );
}

function ExtrasCard({ event, rows, editable }: { event: EventRow; rows: WeekRows; editable: boolean }) {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const [typeId, setTypeId] = useState(event.service_type_id ?? '');
  const [noTeam, setNoTeam] = useState(Boolean(event.no_team));
  const [size, setSize] = useState(() => {
    const type = rows.types.find((t) => t.id === event.service_type_id);
    return String(type ? sizeFor(type, event.size) : DEFAULT_SIZE);
  });
  const [notes, setNotes] = useState(event.notes ?? '');
  const day = localDate(new Date(event.starts_at));
  const [periodStart, setPeriodStart] = useState(event.period_start ? localTime(new Date(event.period_start)) : '');
  const [periodEnd, setPeriodEnd] = useState(event.period_end ? localTime(new Date(event.period_end)) : '');
  const [mode, setMode] = useState<'keep' | 'rebuild'>('keep');
  const [saved, setSaved] = useState(false);

  const built = Boolean(rows.week);
  const hasPeople = rows.assignments.some((a) => a.event_id === event.id && a.person_id && rows.slots.some((s) => s.id === a.slot_id && !s.archived_at));
  const pickedType = rows.types.find((t) => t.id === typeId);
  const sized = Boolean(pickedType?.sized) && !noTeam;
  const sizeChanged = sized && pickedType !== undefined && Number(size) !== sizeFor(pickedType, event.size);
  const crewChanged = (typeId || null) !== (event.service_type_id ?? null) || noTeam !== Boolean(event.no_team) || sizeChanged;
  const askMode = crewChanged && built && hasPeople;
  const notesError = notes.length > NOTES_MAX ? VALIDATION_MESSAGES.notes_too_long : undefined;
  const periodError = event.all_day && periodStart && periodEnd && periodEnd <= periodStart ? VALIDATION_MESSAGES.end_before_start : undefined;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (notesError || periodError) return;
    const fields: Record<string, unknown> = { service_type_id: typeId || null, no_team: noTeam, notes: notes.trim() || null };
    if (sizeChanged) fields.size = Number(size);
    if (event.all_day) {
      fields.period_start = periodStart ? zonedTime(day, periodStart).toISOString() : null;
      fields.period_end = periodEnd ? zonedTime(day, periodEnd).toISOString() : null;
    }
    const typeChanged = (typeId || null) !== (event.service_type_id ?? null) || noTeam !== Boolean(event.no_team);
    const changes = { ...fields, ...(typeChanged ? { type_certainty: typeId ? 'alta' : 'baixa', type_source: 'admin' } : {}) };
    await engine.enqueue('event.update_extras', { id: event.id, ...fields, ...(askMode ? { mode } : {}) }, { baseVersion: event.version, target: { table: 'events', id: event.id, changes } });
    setSaved(true);
    void sendAndRefresh(engine, ['events', 'slots', 'assignments']);
  }

  const options = [{ value: '', label: 'a definir' }, ...rows.types.filter((t) => !t.archived_at || t.id === event.service_type_id).map((t) => ({ value: t.id, label: t.name }))];
  return (
    <Card variant="raised" padding={20}>
      <form className="form-stack" onSubmit={(e) => void save(e)} noValidate aria-label="Dados extras">
        <h2 className="section-title">Dados extras</h2>
        {!editable && <p className="form-text">{event.status === 'cancelled' ? 'Evento cancelado: os dados extras ficam só para leitura.' : 'Só leitura.'}</p>}
        <Select label="Tipo de serviço" value={typeId} onChange={(e) => setTypeId(e.target.value)} options={options} disabled={!editable} />
        {sized && (
          <Select
            label="Porte"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            options={EVENT_SIZES.map((s) => ({ value: String(s), label: SIZE_LABEL[s] }))}
            disabled={!editable}
            hint="Cada porte tem a sua equipe típica (Dados > Tipos de serviço)."
          />
        )}
        <Checkbox label="Não exige equipe" checked={noTeam} onChange={setNoTeam} disabled={!editable} />
        {event.all_day && (
          <div className="form-grid">
            <Input label="Período: início" type="time" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} disabled={!editable} hint="Evento de dia inteiro: informe o período se exigir equipe." />
            <Input label="Período: fim" type="time" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} disabled={!editable} error={periodError} />
          </div>
        )}
        {askMode && (
          <fieldset className="check-group">
            <legend className="field-label">O evento já tem pessoas escaladas</legend>
            <Radio name="modo-vagas" label="Manter as vagas atuais" checked={mode === 'keep'} onChange={() => setMode('keep')} />
            <Radio name="modo-vagas" label={sizeChanged && typeId === (event.service_type_id ?? '') ? 'Refazer as vagas pelo porte novo' : 'Refazer as vagas pelo tipo novo'} checked={mode === 'rebuild'} onChange={() => setMode('rebuild')} />
          </fieldset>
        )}
        <Input
          label="Observações"
          multiline
          rows={4}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          disabled={!editable}
          hint={`${notes.length} de 2.000 caracteres. As pessoas escaladas veem as observações.`}
          error={notesError}
        />
        {editable && (
          <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
            <Button type="submit" disabled={Boolean(notesError || periodError)}>
              Salvar dados extras
            </Button>
            {pendingRows.has(`events:${event.id}`) ? (
              <span className="form-text">a enviar</span>
            ) : (
              saved && (
                <span className="form-text" role="status">
                  Dados extras salvos.
                </span>
              )
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

function SlotsCard({ event, rows, readOnly, now }: { event: EventRow; rows: WeekRows; readOnly: boolean; now: Date }) {
  const engine = useSyncEngine();
  const history = useHistory();
  const [picking, setPicking] = useState<string | null>(null);
  const [roleId, setRoleId] = useState('');
  const index = useMemo(() => buildHistoryIndex((history.rows ?? []).map(toFact)), [history.rows]);
  const today = localDate(now);
  const ctx = useMemo(() => weekContext(rows, now), [rows, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => scheduleModel(rows, ctx, index), [rows, ctx, index]);
  const slots = model.slotsByEvent.get(event.id) ?? [];
  const pickSlot = slots.find((s) => s.id === picking);
  const pickAssignment = picking ? model.bySlot.get(picking) : undefined;

  if (!rows.week) {
    return (
      <Card variant="raised" padding={20}>
        <h2 className="section-title">Vagas</h2>
        <p className="form-text">A semana ainda não foi montada. As vagas nascem em Montar semana, pela equipe do tipo de serviço.</p>
      </Card>
    );
  }

  function addSlot() {
    if (!roleId) return;
    const id = crypto.randomUUID();
    void engine.enqueue('slot.add', { id, event_id: event.id, job_role_id: roleId }, { baseVersion: event.version, target: { table: 'slots', id, changes: { event_id: event.id, job_role_id: roleId, extra: true, archived_at: null } } });
    setRoleId('');
    void sendAndRefresh(engine, ['slots', 'assignments']);
  }

  function removeSlot(slotId: string) {
    const s = rows.slots.find((x) => x.id === slotId);
    if (!s) return;
    void engine.enqueue('slot.remove', { id: s.id }, { baseVersion: s.version, target: { table: 'slots', id: s.id, changes: { archived_at: new Date().toISOString() } } });
  }

  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="vagas-title">
        <h2 id="vagas-title" className="section-title">
          Vagas
        </h2>
        {!needsTeam(event, rows.types) && <p className="form-text">{event.status === 'cancelled' ? 'Evento cancelado: não aceita alocações.' : 'Não exige equipe.'}</p>}
        {slots.length > 0 && (
          <ul className="plain-list slot-list">
            {slots.map((s) => (
              <SlotLine
                key={s.id}
                model={model}
                event={event}
                slot={s}
                readOnly={readOnly}
                onPick={setPicking}
                extra={
                  slotState(model.bySlot.get(s.id)) !== 'confirmed' && (
                    <Button size="sm" variant="ghost" onClick={() => removeSlot(s.id)}>
                      Remover vaga
                    </Button>
                  )
                }
              />
            ))}
          </ul>
        )}
        {!readOnly && needsTeam(event, rows.types) && (
          <div className="inline-form" aria-label="Vaga a mais">
            <Select
              label="Função da vaga a mais"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              placeholder="Escolha a função"
              options={rows.roles.filter((r) => !r.archived_at).map((r) => ({ value: r.id, label: r.name }))}
            />
            <Button variant="secondary" onClick={addSlot} disabled={!roleId}>
              Adicionar vaga
            </Button>
          </div>
        )}
      </section>
      {pickSlot && pickAssignment && (
        <PersonPicker
          ctx={ctx}
          slot={pickSlot}
          assignment={pickAssignment}
          people={rows.people}
          history={index}
          title={slotState(pickAssignment) === 'open' ? 'Escalar' : 'Trocar pessoa'}
          roleName={model.roleName(pickSlot.job_role_id)}
          eventTitle={event.title}
          onClose={() => setPicking(null)}
        />
      )}
    </Card>
  );
}
