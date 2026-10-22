import { addDays, isWeekPast, localDate, weekStartOf } from '@cronograma/core';
import { ClockCircleIcon, SuitcaseIcon, SunIcon } from '@solar-icons/react/bold-duotone';
import { AltArrowLeftIcon, AltArrowRightIcon } from '@solar-icons/react/linear';
import { useMemo, useState } from 'react';
import { useTable, type CalendarSourceRow, type HistoryFactRow } from '../data/catalog';
import { useHistory } from '../data/history';
import { navigate, type RouteProps } from '../router';
import { useSettings } from '../settings/jobs';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { OnlineButton } from '../sync/OnlineButton';
import { AppIcon } from '../ui/AppIcon';
import { Badge, Button, Card } from '../ui/chiaro';
import { formatStamp } from '../ui/format';
import { IconButton } from '../ui/IconButton';
import { Toast } from '../ui/Toast';
import { InternalEventForm } from '../event/InternalEventForm';
import { availabilityByRole, dayMonth, publishSummary, relativeWeekLabel, unpublishedChanges, weekTimeOff, type TimeOff, type WeekRows } from './model';
import { roleIcon } from './roleIcon';
import { NO_EVENTS, PreviewList, SourceAlerts } from './PreviewPage';
import { ProposalBar } from './ProposalBar';
import { PublishDialog } from './PublishDialog';
import { RereadButton } from './RereadButton';
import { ScheduleEditor, useSchedule } from './ScheduleEditor';
import { Seal } from './Seal';
import { UnpublishedBanner } from './UnpublishedBanner';
import { buildWeek, useBuildPending, useNow, useWeekRows } from './useWeek';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Segunda-feira da semana pedida na rota; sem data (ou data inválida), a semana de hoje. */
export function routeWeek(date: string | undefined, now: Date): string {
  return weekStartOf(date && DATE.test(date) ? date : localDate(now));
}

export function stateLabel(rows: WeekRows): string {
  if (!rows.week) return 'Sem montagem';
  return rows.week.state === 'published' ? 'Publicada' : 'Em montagem';
}

// Lado da última troca pelas setas: a semana nova entra deslizando por ele. Fora das setas (link, rota
// digitada), entra só com o esmaecer.
let slideFrom: 'next' | 'prev' | null = null;

function go(base: string, weekStart: string, dir: 'next' | 'prev') {
  slideFrom = dir;
  navigate(`${base}/${weekStart}`);
}

/** "< Semana de 19/10 >" no centro, com a anterior e a seguinte esmaecidas dos lados e "Semana atual" embaixo. */
export function WeekSwitcher({ weekStart, currentWeek, base = '/semana' }: { weekStart: string; currentWeek: string; base?: string }) {
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const relative = relativeWeekLabel(weekStart, currentWeek);
  return (
    <nav className="week-switcher" aria-label="Trocar de semana">
      <button type="button" className="week-switcher-side" onClick={() => go(base, prev, 'prev')} tabIndex={-1} aria-hidden="true">
        Semana de {dayMonth(prev)}
      </button>
      <IconButton icon={AltArrowLeftIcon} label="Semana anterior" onClick={() => go(base, prev, 'prev')} />
      <span key={weekStart} className={`week-switcher-center week-slide week-slide--${slideFrom ?? 'fade'}`}>
        <h1 className="screen-title page-title week-switcher-title">
          <span className="screen-title-light">SEMANA DE</span> <span className="screen-title-black">{dayMonth(weekStart)}</span>
        </h1>
        <span className={`week-relative${weekStart === currentWeek ? ' is-current' : ''}`}>{relative}</span>
      </span>
      <IconButton icon={AltArrowRightIcon} label="Próxima semana" onClick={() => go(base, next, 'next')} />
      <button type="button" className="week-switcher-side" onClick={() => go(base, next, 'next')} tabIndex={-1} aria-hidden="true">
        Semana de {dayMonth(next)}
      </button>
    </nav>
  );
}

/** Semana do administrador: situação e ações no topo, pessoas disponíveis por função e os eventos. */
export function WeekPage({ params }: RouteProps) {
  const now = useNow();
  const today = localDate(now);
  const weekStart = routeWeek(params.date, now);
  const rows = useWeekRows(weekStart);
  const sources = useTable<CalendarSourceRow>('calendar_sources') ?? [];
  const { lastSyncAt } = useSyncState();

  return (
    <section className="page week-page">
      <div className="week-head">
        <WeekSwitcher weekStart={weekStart} currentWeek={weekStartOf(today)} />
        <RereadButton />
      </div>
      <div key={weekStart} className={`week-slide week-slide--${slideFrom ?? 'fade'}`}>
        {!rows ? (
          <p className="form-text">Abrindo a semana.</p>
        ) : rows.events.length === 0 && !rows.week && !lastSyncAt ? (
          <p className="form-text">Buscando os eventos da semana.</p>
        ) : (
          <WeekBody rows={rows} sources={sources} now={now} today={today} />
        )}
      </div>
    </section>
  );
}

interface BodyProps {
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  now: Date;
  today: string;
}

function WeekBody({ rows, sources, now, today }: BodyProps) {
  const engine = useSyncEngine();
  const settings = useSettings();
  const history = useHistory();
  const building = useBuildPending(rows.weekStart);
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const past = isWeekPast(rows.weekStart, now);
  const week = rows.week;
  const live = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled');
  const changes = unpublishedChanges(rows);
  const publishedBy = rows.people.find((p) => p.id === week?.published_by)?.name;
  const aiOn = Boolean(settings?.ai_proposal_enabled);

  const note = !week
    ? past
      ? 'Semana passada fica só para consulta.'
      : 'Revise os tipos dos eventos e monte a semana: só eventos com tipo ganham vagas.'
    : week.state === 'published' && week.published_at
      ? `Publicada em ${formatStamp(week.published_at)}${publishedBy ? ` por ${publishedBy}` : ''}.`
      : 'Em montagem: a equipe ainda não vê esta semana.';

  return (
    <div className="week-built">
      {week?.state === 'published' && <UnpublishedBanner week={week} changes={changes} onPublish={() => setPublishing(true)} onDone={setNotice} />}
      <SourceAlerts sources={sources} />
      <div className="week-toolbar">
        <span className="week-status">
          <Badge tone={week?.state === 'published' ? 'success' : week ? 'brand' : 'soft'}>{stateLabel(rows)}</Badge>
          <span className="form-text">{note}</span>
        </span>
        {!past && (
          <span className="week-actions-buttons">
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              Nova atividade interna
            </Button>
            {!week && live.length > 0 &&
              (building ? (
                <Seal>montagem a enviar</Seal>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void buildWeek(engine, rows.weekStart)}>
                  Montar semana
                </Button>
              ))}
            {week?.state === 'building' && (
              <OnlineButton variant="secondary" size="sm" onClick={() => setPublishing(true)}>
                Publicar
              </OnlineButton>
            )}
            {aiOn && live.length > 0 && (
              <Button size="sm" onClick={() => navigate(`/semana/${rows.weekStart}/proposta`)}>
                Propor escala
              </Button>
            )}
          </span>
        )}
      </div>
      {week ? (
        <BuiltWeek rows={rows} now={now} today={today} settings={settings} historyRows={history.rows} />
      ) : (
        <UnbuiltWeek rows={rows} sources={sources} today={today} past={past} historyRows={history.rows} />
      )}

      {publishing && week && (
        <PublishDialog
          week={week}
          summary={publishSummary(rows)}
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

/** Quantas pessoas estão disponíveis em cada função na semana. */
export function AvailabilityPanel({ rows, historyRows }: { rows: WeekRows; historyRows: readonly HistoryFactRow[] | null }) {
  const items = useMemo(
    () => availabilityByRole(rows, (historyRows ?? []).map((r) => ({ personId: r.person_id, jobRoleId: r.job_role_id }))),
    [rows, historyRows],
  );
  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="disponiveis-title">
        <h2 id="disponiveis-title" className="section-title">
          Pessoas disponíveis por função
        </h2>
        {items.length === 0 ? (
          <p className="form-text" style={{ margin: 0 }}>
            Ninguém disponível nesta semana.
          </p>
        ) : (
          <ul className="plain-list availability-list" aria-label="Pessoas disponíveis por função">
            {items.map((it) => (
              <li key={it.jobRoleId} className="availability-item" aria-label={it.name}>
                <span className="availability-icon">
                  <AppIcon icon={roleIcon(it.name)} size={26} />
                </span>
                <span className="availability-count">{it.people}</span>
                <span className="availability-role">{it.name}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="page-note" style={{ marginBottom: 0 }}>
          Quem tem mais de uma função conta na que mais fez. Ausências da semana já descontadas.
        </p>
      </section>
    </Card>
  );
}

const TIME_OFF = {
  ferias: { label: 'Férias', icon: SuitcaseIcon },
  folga: { label: 'Folga', icon: SunIcon },
  ausencia: { label: 'Ausência', icon: ClockCircleIcon },
} as const;

function spanText(t: TimeOff): string {
  return t.from === t.to ? dayMonth(t.from) : `${dayMonth(t.from)} a ${dayMonth(t.to)}`;
}

/** Quem está de folga, férias ou ausente na semana, pelas ausências cadastradas e pela agenda. */
export function TimeOffPanel({ rows }: { rows: WeekRows }) {
  const items = useMemo(() => weekTimeOff(rows), [rows]);
  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="folgas-title">
        <h2 id="folgas-title" className="section-title">
          Folga e férias
        </h2>
        {items.length === 0 ? (
          <p className="form-text" style={{ margin: 0 }}>
            Ninguém de folga ou férias nesta semana.
          </p>
        ) : (
          <ul className="plain-list timeoff-list" aria-label="Folga e férias">
            {items.map((t) => (
              <li key={t.key} className={`timeoff-item timeoff-item--${t.kind}`} aria-label={t.name}>
                <span className="timeoff-icon">
                  <AppIcon icon={TIME_OFF[t.kind].icon} size={22} />
                </span>
                <span className="list-row-main">
                  <span className="list-row-title">{t.name}</span>
                  <span className="list-row-sub">
                    {TIME_OFF[t.kind].label}, {spanText(t)}
                    {t.agendaTitle && t.personId ? `. Na agenda: ${t.agendaTitle}` : t.agendaTitle ? '. Pela agenda' : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

interface PartProps {
  rows: WeekRows;
  today: string;
  historyRows: readonly HistoryFactRow[] | null;
}

function UnbuiltWeek({ rows, sources, today, past, historyRows }: PartProps & { sources: readonly CalendarSourceRow[]; past: boolean }) {
  const live = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled');
  return (
    <>
      <AvailabilityPanel rows={rows} historyRows={historyRows} />
      <TimeOffPanel rows={rows} />
      {live.length === 0 ? (
        <Card variant="raised" padding={24}>
          <p className="form-text" style={{ margin: 0 }}>
            {NO_EVENTS}.
          </p>
        </Card>
      ) : (
        <PreviewList rows={rows} sources={sources} today={today} readOnly={past} />
      )}
    </>
  );
}

function BuiltWeek({ rows, now, today, settings, historyRows }: PartProps & { now: Date; settings: ReturnType<typeof useSettings> }) {
  const week = rows.week as NonNullable<WeekRows['week']>;
  const schedule = useSchedule(rows, now, today, historyRows);
  return (
    <>
      <ProposalBar week={week} settings={settings} proposed={schedule.proposed} readOnly={schedule.readOnly} />
      <AvailabilityPanel rows={rows} historyRows={historyRows} />
      <TimeOffPanel rows={rows} />
      <ScheduleEditor schedule={schedule} today={today} />
    </>
  );
}
