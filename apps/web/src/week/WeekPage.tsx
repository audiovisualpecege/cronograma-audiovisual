import { addDays, buildHistoryIndex, isWeekPast, localDate, weekStartOf } from '@cronograma/core';
import { AltArrowLeftIcon, AltArrowRightIcon } from '@solar-icons/react/linear';
import { useMemo, useState } from 'react';
import { toFact, useTable, type CalendarSourceRow } from '../data/catalog';
import { useHistory } from '../data/history';
import { PageTitle } from '../layout/PageTitle';
import { navigate, type RouteProps } from '../router';
import { useSettings } from '../settings/jobs';
import { useSyncState } from '../sync/SyncProvider';
import { Badge, Button, Tabs } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { formatStamp } from '../ui/format';
import { IconButton } from '../ui/IconButton';
import { Toast } from '../ui/Toast';
import { InternalEventForm } from '../event/InternalEventForm';
import { LoadPanel } from './LoadPanel';
import { dayMonth, loadRows, publishSummary, roleBalance, slotState, unpublishedChanges, weekContext, type WeekRows } from './model';
import { PersonPicker } from './PersonPicker';
import { PreviewPage, SourceAlerts } from './PreviewPage';
import { ProposalBar } from './ProposalBar';
import { PublishDialog } from './PublishDialog';
import { RereadButton } from './RereadButton';
import { RoleBalancePanel } from './RoleBalancePanel';
import { ScheduleGrid } from './ScheduleGrid';
import { ScheduleList } from './ScheduleList';
import { scheduleModel } from './schedule';
import { SlotLine } from './SlotLine';
import { OnlineButton } from '../sync/OnlineButton';
import { UnpublishedBanner } from './UnpublishedBanner';
import { useNow, useWeekRows } from './useWeek';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Segunda-feira da semana pedida na rota; sem data (ou data inválida), a semana de hoje. */
export function routeWeek(date: string | undefined, now: Date): string {
  return weekStartOf(date && DATE.test(date) ? date : localDate(now));
}

function stateLabel(rows: WeekRows): string {
  if (!rows.week) return 'Sem montagem';
  return rows.week.state === 'published' ? 'Publicada' : 'Em montagem';
}

/** Semana do administrador: prévia antes de montar; escala, proposta e publicação depois. */
export function WeekPage({ params }: RouteProps) {
  const now = useNow();
  const today = localDate(now);
  const weekStart = routeWeek(params.date, now);
  const rows = useWeekRows(weekStart);
  const sources = useTable<CalendarSourceRow>('calendar_sources') ?? [];
  const { lastSyncAt } = useSyncState();

  return (
    <section className="page week-page">
      <div className="page-head">
        <PageTitle light="SEMANA DE" black={dayMonth(weekStart)} />
        <span className="week-nav">
          <IconButton icon={AltArrowLeftIcon} label="Semana anterior" onClick={() => navigate(`/semana/${addDays(weekStart, -7)}`)} />
          {rows && <Badge tone={rows.week?.state === 'published' ? 'success' : rows.week ? 'brand' : 'soft'}>{stateLabel(rows)}</Badge>}
          <IconButton icon={AltArrowRightIcon} label="Próxima semana" onClick={() => navigate(`/semana/${addDays(weekStart, 7)}`)} />
          <RereadButton />
        </span>
      </div>
      {!rows ? (
        <p className="form-text">Abrindo a semana.</p>
      ) : rows.events.length === 0 && !rows.week && !lastSyncAt ? (
        <p className="form-text">Buscando os eventos da semana.</p>
      ) : rows.week ? (
        <BuiltWeek rows={rows} sources={sources} now={now} today={today} />
      ) : (
        <PreviewPage rows={rows} sources={sources} now={now} today={today} />
      )}
    </section>
  );
}

interface BuiltProps {
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  now: Date;
  today: string;
}

function BuiltWeek({ rows, sources, now, today }: BuiltProps) {
  const week = rows.week as NonNullable<WeekRows['week']>;
  const settings = useSettings();
  const history = useHistory();
  const [view, setView] = useState<'lista' | 'grade'>('lista');
  const [picking, setPicking] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const readOnly = isWeekPast(rows.weekStart, now);

  const index = useMemo(() => buildHistoryIndex((history.rows ?? []).map(toFact)), [history.rows]);
  // O relógio só importa por dia aqui (semana passada); recalcula quando as linhas mudam.
  const ctx = useMemo(() => weekContext(rows, now), [rows, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => scheduleModel(rows, ctx, index), [rows, ctx, index]);
  const loads = useMemo(() => loadRows(rows, ctx), [rows, ctx]);
  const balance = useMemo(() => roleBalance(rows, 'built'), [rows]);
  const summary = publishSummary(rows);
  const changes = unpublishedChanges(rows);
  const proposed = rows.assignments.filter((a) => slotState(a) === 'proposed' && model.slotsByEvent.get(a.event_id)?.some((s) => s.id === a.slot_id));
  const publishedBy = rows.people.find((p) => p.id === week.published_by)?.name;

  const pickSlot = picking ? rows.slots.find((s) => s.id === picking) : undefined;
  const pickAssignment = picking ? model.bySlot.get(picking) : undefined;
  const pickEvent = pickSlot ? rows.events.find((e) => e.id === pickSlot.event_id) : undefined;
  const selSlot = selected ? rows.slots.find((s) => s.id === selected) : undefined;
  const selEvent = selSlot ? rows.events.find((e) => e.id === selSlot.event_id) : undefined;

  return (
    <div className="week-built">
      {week.state === 'published' && <UnpublishedBanner week={week} changes={changes} onPublish={() => setPublishing(true)} onDone={setNotice} />}
      <SourceAlerts sources={sources} />
      <div className="week-actions">
        <p className="form-text" style={{ margin: 0 }}>
          {week.state === 'published' && week.published_at
            ? `Publicada em ${formatStamp(week.published_at)}${publishedBy ? ` por ${publishedBy}` : ''}.`
            : 'Em montagem: a equipe ainda não vê esta semana.'}
        </p>
        <span className="week-actions-buttons">
          {!readOnly && (
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              Nova atividade interna
            </Button>
          )}
          {week.state === 'building' && !readOnly && <OnlineButton onClick={() => setPublishing(true)}>Publicar</OnlineButton>}
        </span>
      </div>
      <ProposalBar week={week} settings={settings} proposed={proposed} readOnly={readOnly} />
      <div className="week-columns">
        <div className="week-main">
          <Tabs
            variant="pill"
            items={[
              { value: 'lista', label: 'Lista por evento' },
              { value: 'grade', label: 'Grade por pessoa' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'lista' | 'grade')}
            style={{ marginBottom: 'var(--space-4)' }}
          />
          {view === 'lista' ? (
            <ScheduleList model={model} readOnly={readOnly} today={today} onPick={setPicking} />
          ) : (
            <ScheduleGrid model={model} readOnly={readOnly} today={today} onPick={setSelected} />
          )}
        </div>
        <aside className="week-side">
          <RoleBalancePanel balance={balance} roleName={model.roleName} />
          <LoadPanel rows={loads} />
        </aside>
      </div>

      {selSlot && selEvent && (
        <Dialog open onClose={() => setSelected(null)} title={selEvent.title || 'Vaga'} width={640}>
          <ul className="plain-list slot-list">
            <SlotLine
              model={model}
              event={selEvent}
              slot={selSlot}
              readOnly={readOnly}
              onPick={(id) => {
                setSelected(null);
                setPicking(id);
              }}
            />
          </ul>
          <p className="form-text">
            <a className="text-link" href={`#/evento/${selEvent.id}`}>
              Abrir o evento
            </a>
          </p>
        </Dialog>
      )}
      {pickSlot && pickAssignment && pickEvent && (
        <PersonPicker
          ctx={ctx}
          slot={pickSlot}
          assignment={pickAssignment}
          people={rows.people}
          history={index}
          title={slotState(pickAssignment) === 'open' ? 'Escalar' : 'Trocar pessoa'}
          roleName={model.roleName(pickSlot.job_role_id)}
          eventTitle={pickEvent.title}
          onClose={() => setPicking(null)}
        />
      )}
      {publishing && (
        <PublishDialog
          week={week}
          summary={summary}
          changes={changes}
          onClose={() => setPublishing(false)}
          onDone={(m) => {
            setPublishing(false);
            setNotice(m);
          }}
        />
      )}
      {creating && <InternalEventForm defaultDate={rows.weekStart} types={rows.types} onClose={() => setCreating(false)} />}
      {notice && (
        <div className="toast-stack">
          <Toast tone="success" title="Pronto" message={notice} onClose={() => setNotice(null)} />
        </div>
      )}
    </div>
  );
}
