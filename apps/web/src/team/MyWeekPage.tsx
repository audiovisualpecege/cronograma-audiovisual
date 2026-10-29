import { AltArrowLeftIcon, AltArrowRightIcon, MapPointIcon } from '@solar-icons/react/linear';
import { addDays, localDate, weekStartOf } from '@cronograma/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMe } from '../auth/me';
import { PageTitle } from '../layout/PageTitle';
import { navigate, type RouteProps } from '../router';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';
import { Card } from '../ui/chiaro';
import { IconButton } from '../ui/IconButton';
import { dayMonth, eventSpan } from '../week/model';
import { Seal } from '../week/Seal';
import { useNow } from '../week/useWeek';
import { ABSENCE_LABEL, mapsUrl, myWeek, type MyActivity, type MyDay } from './model';
import { useTeamRows } from './useTeamWeek';

/** Última vez que a pessoa abriu "Minha semana" neste aparelho (selo "mudou", US-019 AC-4). */
export const SEEN_KEY = 'myWeekSeenAt';

// Dias com muitas atividades rolam dentro do próprio dia, sem cortar nada (US-019 EC-4).
const SCROLL_FROM = 10;

/** Semana pedida na rota ou a corrente; qualquer data cai na segunda-feira da sua semana. */
export function routeWeek(date: string | undefined, now: Date): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? weekStartOf(date) : weekStartOf(now);
}

/** Lê o "visto por último" da abertura anterior e grava o de agora, uma vez por tela aberta. */
function useSeenAt(): { seenAt: string | null; ready: boolean } {
  const engine = useSyncEngine();
  const [state, setState] = useState<{ seenAt: string | null; ready: boolean }>({ seenAt: null, ready: false });
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      const previous = (await engine.store.getMeta<string>(SEEN_KEY)) ?? null;
      setState({ seenAt: previous, ready: true });
      await engine.store.setMeta(SEEN_KEY, new Date().toISOString());
    })().catch(() => setState({ seenAt: null, ready: true }));
  }, [engine]);
  return state;
}

/** "Minha semana": a tela inicial da equipe (US-019). */
export function MyWeekPage({ params }: RouteProps) {
  const me = useMe();
  const now = useNow();
  const weekStart = routeWeek(params.date, now);
  const rows = useTeamRows(weekStart);
  const { lastSyncAt, online } = useSyncState();
  const { seenAt, ready } = useSeenAt();
  const week = useMemo(() => (rows && ready ? myWeek(rows, me.personId, now, seenAt) : null), [rows, ready, me.personId, now, seenAt]);
  const today = localDate(now);
  const hasToday = weekStart <= today && today <= addDays(weekStart, 6);

  let body;
  if (!week) {
    body = <p className="form-text">Abrindo a semana.</p>;
  } else if (!lastSyncAt && !online && !week.published) {
    body = <p className="form-text">O primeiro acesso precisa de internet. Conecte o aparelho e abra de novo.</p>;
  } else if (!week.published) {
    body = <p className="page-note">A escala desta semana ainda não foi publicada.</p>;
  } else {
    body = (
      <>
        {!week.scheduled && <p className="page-note">Você não está escalado nesta semana.</p>}
        <ol className="my-week" aria-label="Dias da semana">
          {week.days
            .filter((d) => week.scheduled || d.absences.length > 0 || d.today)
            .map((d) => (
              <DayItem key={d.date} day={d} defaultOpen={hasToday ? d.today : true} />
            ))}
        </ol>
      </>
    );
  }

  return (
    <section className="page my-week-page">
      <div className="page-head">
        <PageTitle light="MINHA SEMANA" black={dayMonth(weekStart)} />
        <span className="week-nav">
          <IconButton icon={AltArrowLeftIcon} label="Semana anterior" onClick={() => navigate(`/minha-semana/${addDays(weekStart, -7)}`)} />
          <IconButton icon={AltArrowRightIcon} label="Semana seguinte" onClick={() => navigate(`/minha-semana/${addDays(weekStart, 7)}`)} />
        </span>
      </div>
      {body}
    </section>
  );
}

function DayItem({ day, defaultOpen }: { day: MyDay; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const count = day.activities.length;
  return (
    <li className={day.today ? 'my-day my-day--today' : 'my-day'} aria-current={day.today ? 'date' : undefined} aria-label={day.label}>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="my-day-summary">
          <span className="day-title">{day.label}</span>
          <span className="tag-row">
            {day.today && <Seal kind="hoje">hoje</Seal>}
            {day.absences.map((k) => (
              <Seal key={k} kind="soft">
                {ABSENCE_LABEL[k]}
              </Seal>
            ))}
            <span className="list-count">{count === 0 ? 'sem atividades' : count === 1 ? '1 atividade' : `${count} atividades`}</span>
          </span>
        </summary>
        {count > 0 && (
          <ul className="my-day-list plain-list" aria-label={`Atividades de ${day.label}`} style={count >= SCROLL_FROM ? { maxHeight: '70vh', overflowY: 'auto' } : undefined}>
            {day.activities.map((a) => (
              <li key={a.event.id}>
                <ActivityCard activity={a} today={day.today} />
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

function ActivityCard({ activity: a, today }: { activity: MyActivity; today: boolean }) {
  const e = a.event;
  return (
    <Card variant="raised" padding={16}>
      <article className="activity" aria-label={e.title || 'Sem título'}>
        <div className="activity-time">{eventSpan(e)}</div>
        <h3 className={a.cancelled ? 'activity-title is-cancelled' : 'activity-title'}>
          <a className="activity-link" href={`#/evento/${e.id}`}>
            {e.title || 'Sem título'}
          </a>
        </h3>
        <div className="tag-row">
          {today && !a.cancelled && <Seal kind="hoje">hoje</Seal>}
          {e.origin === 'internal' && <Seal kind="soft">interna</Seal>}
          {a.meetingSectors && <Seal kind="soft">reunião do setor</Seal>}
          {a.changes && <Seal kind="mudou">mudou</Seal>}
          {a.cancelled && <Seal kind="cancelado">cancelado</Seal>}
        </div>
        {a.changes && (
          <ul className="plain-list activity-changes" aria-label="O que mudou">
            {a.changes.map((c) => (
              <li key={c.label}>
                {c.label}: era {c.before}, agora {c.after}
              </li>
            ))}
          </ul>
        )}
        <dl className="field-list">
          {!a.meetingSectors && (
            <>
              <dt>Função</dt>
              <dd>{a.myRoles.join(', ')}</dd>
            </>
          )}
          <dt>Local</dt>
          <dd>
            {e.location ? (
              <a className="text-link activity-place" href={mapsUrl(e.location)} target="_blank" rel="noreferrer">
                <AppIcon icon={MapPointIcon} size={16} />
                <span>{e.location}</span>
              </a>
            ) : (
              'Sem local'
            )}
          </dd>
          {a.notes && (
            <>
              <dt>Observações</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{a.notes}</dd>
            </>
          )}
          {!a.meetingSectors && <dt>Colegas</dt>}
          {!a.meetingSectors && (
          <dd>
            {a.colleagues.length === 0 ? (
              'Só você'
            ) : (
              <ul className="plain-list" aria-label="Colegas">
                {a.colleagues.map((c, i) => (
                  <li key={`${c.roleId}:${c.personId ?? i}`}>
                    {c.personName ?? <Seal kind="soft">a definir</Seal>} <span className="list-row-sub">({c.roleName})</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
          )}
        </dl>
      </article>
    </Card>
  );
}
