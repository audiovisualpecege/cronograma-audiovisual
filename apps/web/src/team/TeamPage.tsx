import { AltArrowLeftIcon, AltArrowRightIcon } from '@solar-icons/react/linear';
import { addDays, localDate } from '@cronograma/core';
import { useMemo, useState } from 'react';
import { byName } from '../data/catalog';
import { PageTitle } from '../layout/PageTitle';
import { navigate, type RouteProps } from '../router';
import { useSyncState } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { IconButton } from '../ui/IconButton';
import { Select } from '../ui/Select';
import { VirtualList } from '../ui/VirtualList';
import { dayMonth, eventSpan } from '../week/model';
import { Seal } from '../week/Seal';
import { useNow } from '../week/useWeek';
import { filterActivities, hasFilter, NO_FILTER, publishedWeek, teamLines, type TeamFilter, type TeamLine } from './model';
import { routeWeek } from './MyWeekPage';
import { useTeamRows } from './useTeamWeek';

// Lista virtual (US-020 EC-3): linhas de altura fixa, só as visíveis são desenhadas.
const ROW_HEIGHT = 56;
const LIST_HEIGHT = 640;

/** "Equipe": a semana publicada de todos, com filtros por setor, função e pessoa (US-020). */
export function TeamPage({ params }: RouteProps) {
  const now = useNow();
  const weekStart = routeWeek(params.date, now);
  const rows = useTeamRows(weekStart);
  const { lastSyncAt, online } = useSyncState();
  const [filter, setFilter] = useState<TeamFilter>(NO_FILTER);
  const today = localDate(now);

  const week = useMemo(() => (rows ? publishedWeek(rows) : null), [rows]);
  const lines = useMemo(() => {
    if (!rows || !week) return [];
    return teamLines(filterActivities(week.activities, filter, rows), weekStart, today);
  }, [rows, week, filter, weekStart, today]);

  const sectors = useMemo(() => (rows?.sectors ?? []).filter((s) => !s.archived_at).sort(byName), [rows]);
  const roles = useMemo(() => (rows?.roles ?? []).filter((r) => !r.archived_at).sort(byName), [rows]);
  const people = useMemo(() => (rows?.people ?? []).filter((p) => (p as { active?: boolean }).active !== false).sort(byName), [rows]);
  const set = (patch: Partial<TeamFilter>) => setFilter((f) => ({ ...f, ...patch }));

  let body;
  if (!rows || !week) {
    body = <p className="form-text">Abrindo a semana.</p>;
  } else if (!lastSyncAt && !online && !week.published) {
    body = <p className="form-text">O primeiro acesso precisa de internet. Conecte o aparelho e abra de novo.</p>;
  } else if (!week.published) {
    body = <p className="page-note">A escala desta semana ainda não foi publicada.</p>;
  } else {
    body = (
      <>
        <div className="filter-bar" role="search" aria-label="Filtros">
          <Select label="Setor" value={filter.sectorId} onChange={(e) => set({ sectorId: e.target.value })} placeholder="Todos os setores" options={sectors.map((s) => ({ value: s.id, label: s.name }))} />
          <Select label="Função" value={filter.roleId} onChange={(e) => set({ roleId: e.target.value })} placeholder="Todas as funções" options={roles.map((r) => ({ value: r.id, label: r.name }))} />
          <Select label="Pessoa" value={filter.personId} onChange={(e) => set({ personId: e.target.value })} placeholder="Todas as pessoas" options={people.map((p) => ({ value: p.id, label: p.name }))} />
        </div>
        <VirtualList<TeamLine>
          label="Atividades da equipe"
          items={lines}
          rowHeight={ROW_HEIGHT}
          height={LIST_HEIGHT}
          getKey={(l) => l.key}
          renderRow={(l) => <Line line={l} />}
          empty={
            hasFilter(filter) ? (
              <div className="page-note" role="status">
                <p style={{ margin: '0 0 12px' }}>Nenhuma atividade com este filtro</p>
                <Button variant="secondary" size="sm" onClick={() => setFilter(NO_FILTER)}>
                  Limpar filtros
                </Button>
              </div>
            ) : (
              <p className="page-note">Nenhuma atividade publicada nesta semana.</p>
            )
          }
        />
      </>
    );
  }

  return (
    <section className="page team-page">
      <div className="page-head">
        <PageTitle light="EQUIPE" black={dayMonth(weekStart)} />
        <span className="week-nav">
          <IconButton icon={AltArrowLeftIcon} label="Semana anterior" onClick={() => navigate(`/equipe/${addDays(weekStart, -7)}`)} />
          <IconButton icon={AltArrowRightIcon} label="Semana seguinte" onClick={() => navigate(`/equipe/${addDays(weekStart, 7)}`)} />
        </span>
      </div>
      {body}
    </section>
  );
}

function Line({ line }: { line: TeamLine }) {
  if (line.kind === 'day') {
    return (
      <div className="team-line team-line--day">
        <span className="day-title">{line.label}</span>
        {line.today && <Seal kind="hoje">hoje</Seal>}
      </div>
    );
  }
  const a = line.activity;
  if (line.kind === 'event') {
    return (
      <div className="team-line team-line--event" aria-label={a.event.title || 'Sem título'}>
        <span className="activity-time">{eventSpan(a.event)}</span>
        <a className={a.cancelled ? 'activity-link team-line-title is-cancelled' : 'activity-link team-line-title'} href={`#/evento/${a.event.id}`} title={a.event.title}>
          {a.event.title || 'Sem título'}
        </a>
        {a.event.origin === 'internal' && <Seal kind="soft">interna</Seal>}
        {a.cancelled && <Seal kind="cancelado">cancelado</Seal>}
      </div>
    );
  }
  const c = line.crew;
  return (
    <div className="team-line team-line--crew" aria-label={`${a.event.title}: ${c.roleName}: ${c.personName ?? 'a definir'}`}>
      <span className="slot-role">{c.roleName}</span>
      {c.personName ? <span>{c.personName}</span> : <Seal kind="soft">a definir</Seal>}
    </div>
  );
}
