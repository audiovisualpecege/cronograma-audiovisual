import { addDays, isWeekPast, localDate, weekStartOf } from '@cronograma/core';
import { AltArrowLeftIcon, AltArrowRightIcon } from '@solar-icons/react/linear';
import { useState } from 'react';
import { useTable, type CalendarSourceRow } from '../data/catalog';
import { useHistory } from '../data/history';
import { navigate, type RouteProps } from '../router';
import { useSyncState } from '../sync/SyncProvider';
import { OnlineButton } from '../sync/OnlineButton';
import { Badge, Button, Card } from '../ui/chiaro';
import { formatStamp } from '../ui/format';
import { IconButton } from '../ui/IconButton';
import { Toast } from '../ui/Toast';
import { InternalEventForm } from '../event/InternalEventForm';
import { EventPanel } from './EventPanel';
import { dayMonth, publishSummary, relativeWeekLabel, unpublishedChanges, type WeekRows } from './model';
import { NO_EVENTS, SourceAlerts } from './PreviewPage';
import { PublishDialog } from './PublishDialog';
import { RereadButton } from './RereadButton';
import { UnpublishedBanner } from './UnpublishedBanner';
import { untyped, useIdentifyTypes } from './useIdentifyTypes';
import { BoardReview, BoardScore, WeekBoard } from './WeekBoard';
import { useNow, useWeekRows } from './useWeek';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

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

/** "< Semana de 19/10 >" com "Semana atual" embaixo. */
export function WeekSwitcher({ weekStart, currentWeek, base = '/semana' }: { weekStart: string; currentWeek: string; base?: string }) {
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const relative = relativeWeekLabel(weekStart, currentWeek);
  return (
    <nav className="week-switcher" aria-label="Trocar de semana">
      <IconButton icon={AltArrowLeftIcon} label="Semana anterior" onClick={() => go(base, prev, 'prev')} />
      <span key={weekStart} className={`week-switcher-center week-slide week-slide--${slideFrom ?? 'fade'}`}>
        <h1 className="screen-title page-title week-switcher-title">
          <span className="screen-title-light">SEMANA DE</span> <span className="screen-title-black">{dayMonth(weekStart)}</span>
        </h1>
        <span className={`week-relative${weekStart === currentWeek ? ' is-current' : ''}`}>{relative}</span>
      </span>
      <IconButton icon={AltArrowRightIcon} label="Próxima semana" onClick={() => go(base, next, 'next')} />
    </nav>
  );
}

/** Situação da semana no topo: o selo e, só quando informa algo, uma linha curta (publicada quando, só consulta). */
function WeekState({ rows, now }: { rows: WeekRows; now: Date }) {
  const week = rows.week;
  const publishedBy = rows.people.find((p) => p.id === week?.published_by)?.name;
  const note = isWeekPast(rows.weekStart, now)
    ? 'Só para consulta'
    : week?.state === 'published' && week.published_at
      ? `Publicada em ${formatStamp(week.published_at)}${publishedBy ? ` por ${publishedBy}` : ''}`
      : null;
  return (
    <span className="week-state">
      <Badge tone={week?.state === 'published' ? 'success' : week ? 'brand' : 'soft'}>{stateLabel(rows)}</Badge>
      {note && <span className="week-state-note">{note}</span>}
    </span>
  );
}

/** Semana do administrador: a grade da escala numa tela só, com o placar e as ações no topo. */
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
        {rows ? <WeekState rows={rows} now={now} /> : <span />}
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
  const history = useHistory();
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const past = isWeekPast(rows.weekStart, now);
  const week = rows.week;
  const changes = unpublishedChanges(rows);
  const historyLoading = history.rows === null && history.status === 'loading';
  const identify = useIdentifyTypes(rows, false);
  const missingType = untyped(rows).length;

  const newActivity = !past && (
    <Button variant="ghost" size="sm" onClick={() => setCreating(true)} title="Nova atividade interna">
      Nova atividade
    </Button>
  );

  return (
    <div className="week-built">
      {week?.state === 'published' && <UnpublishedBanner week={week} changes={changes} onPublish={() => setPublishing(true)} onDone={setNotice} />}
      <SourceAlerts sources={sources} />
      {rows.events.filter((e) => !e.ignored).length === 0 ? (
        <>
          <div className="week-toolbar">
            <span className="week-actions-buttons">{newActivity}</span>
          </div>
          <Card variant="raised" padding={24}>
            <p className="form-text" style={{ margin: 0 }}>
              {NO_EVENTS}.
            </p>
          </Card>
        </>
      ) : (
        <WeekBoard
          rows={rows}
          now={now}
          today={today}
          historyRows={history.rows}
          historyLoading={historyLoading}
          onOpenEvent={setViewing}
          viewing={viewing}
          renderPanel={(event, crew) => (
            <EventPanel event={event} rows={rows} sources={sources} today={today} readOnly={past} crew={crew} onClose={() => setViewing(null)} />
          )}
          renderBar={(board, scrollTo, viewSwitch) => (
            <>
              {/* Uma linha só: visualização, placar e filtro à esquerda; ações à direita. */}
              <div className="week-toolbar board-bar">
                <span className="board-bar-left">
                  {viewSwitch}
                  <BoardScore counts={board.counts} onGo={scrollTo} />
                  {!past && <BoardReview state={board} onGo={scrollTo} />}
                </span>
                {!past && (
                  <span className="week-actions-buttons">
                    {missingType > 0 && (
                      <OnlineButton
                        variant="ghost"
                        size="sm"
                        disabled={identify.running}
                        title={`${plural(missingType, 'atividade está', 'atividades estão')} sem tipo de serviço: sem tipo, não há vagas.`}
                        onClick={() => void identify.identify()}
                      >
                        {identify.running ? 'Identificando' : `Identificar tipos (${missingType})`}
                      </OnlineButton>
                    )}
                    {newActivity}
                    {board.toConfirm > 0 && (
                      <Button size="sm" onClick={board.confirmAll}>
                        Confirmar sugestões ({board.toConfirm})
                      </Button>
                    )}
                    {week?.state === 'building' && (
                      <OnlineButton size="sm" variant={board.toConfirm > 0 ? 'secondary' : 'primary'} onClick={() => setPublishing(true)}>
                        Publicar
                      </OnlineButton>
                    )}
                  </span>
                )}
              </div>
              {!past && board.historyLoading && (
                <p className="form-text board-note" role="status">
                  Lendo o histórico da equipe para sugerir as pessoas.
                </p>
              )}
              {identify.error && (
                <p className="form-message form-message--alert" role="alert">
                  {identify.error}
                </p>
              )}
              {publishing && week && (
                <PublishDialog
                  week={week}
                  summary={publishSummary(rows)}
                  suggested={board.drafts}
                  changes={changes}
                  onClose={() => setPublishing(false)}
                  onDone={(m) => {
                    setPublishing(false);
                    setNotice(m);
                  }}
                />
              )}
            </>
          )}
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
