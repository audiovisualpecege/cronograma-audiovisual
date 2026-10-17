import { addDays, localDate, weekStartOf } from '@cronograma/core';
import { DangerTriangleIcon } from '@solar-icons/react/linear';
import { useMemo } from 'react';
import {
  useTable,
  type AssignmentRow,
  type CalendarSourceRow,
  type EventRow,
  type PublishedRow,
  type ServiceTypeRow,
  type SlotRow,
  type WeekRow,
} from '../../data/catalog';
import { PageTitle } from '../../layout/PageTitle';
import { useSettings } from '../../settings/jobs';
import { useSyncState } from '../../sync/SyncProvider';
import { AppIcon } from '../../ui/AppIcon';
import { Card } from '../../ui/chiaro';
import { dayMonth } from '../../week/model';
import { SourceAlerts } from '../../week/PreviewPage';
import { RereadButton } from '../../week/RereadButton';
import { Seal } from '../../week/Seal';
import { useNow } from '../../week/useWeek';
import { dashboardPending, workerAlert } from './pending';

const KIND_LABEL = {
  review: 'agenda',
  unpublished: 'não publicada',
  open: 'sem escala',
  proposed: 'proposta',
  duplicate: 'duplicado',
  unbuilt: 'sem montagem',
} as const;

/** Painel do administrador (US-001 AC-2): pendências no topo, saúde do serviço de fundo e das agendas. */
export function DashboardPage() {
  const now = useNow();
  const settings = useSettings();
  const { lastSyncAt } = useSyncState();
  const events = useTable<EventRow>('events');
  const weeks = useTable<WeekRow>('weeks');
  const slots = useTable<SlotRow>('slots');
  const assignments = useTable<AssignmentRow>('assignments');
  const published = useTable<PublishedRow>('published_assignments');
  const types = useTable<ServiceTypeRow>('service_types');
  const sources = useTable<CalendarSourceRow>('calendar_sources') ?? [];
  const ready = events && weeks && slots && assignments && published && types;
  const today = localDate(now);

  const items = useMemo(
    () => (ready ? dashboardPending({ events, weeks, slots, assignments, published, types, now }) : []),
    // O painel recalcula quando as tabelas mudam; o relógio só pesa na virada da semana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, events, weeks, slots, assignments, published, types, today],
  );
  const worker = settings ? workerAlert(settings.worker_seen_at, now) : null;
  const current = weekStartOf(today);
  const shortcuts = [
    { ws: current, label: 'Semana atual' },
    { ws: addDays(current, 7), label: 'Próxima semana' },
  ];

  return (
    <section className="page dashboard-page">
      <div className="page-head">
        <PageTitle light="PAINEL DA" black="SEMANA" />
        <RereadButton />
      </div>
      {worker && (
        <p className="form-message form-message--alert worker-alert" role="alert">
          <AppIcon icon={DangerTriangleIcon} size={18} /> {worker}
        </p>
      )}
      <SourceAlerts sources={sources} />
      <Card variant="raised" padding={24}>
        <section aria-labelledby="pendencias-title">
          <h2 id="pendencias-title" className="section-title">
            Pendências
          </h2>
          {!ready || (!lastSyncAt && items.length === 0) ? (
            <p className="form-text">Buscando as pendências.</p>
          ) : items.length === 0 ? (
            <p className="form-text">Nenhuma pendência. A escala está em dia.</p>
          ) : (
            <ul className="plain-list pending-list" aria-label="Pendências">
              {items.map((it) => (
                <li key={it.key} className="pending-item">
                  <Seal kind={it.kind === 'review' ? 'mudou' : it.kind === 'proposed' ? 'proposta' : 'plain'}>{KIND_LABEL[it.kind]}</Seal>
                  <a className="text-link" href={`#${it.link}`}>
                    {it.text}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>
      <div className="card-grid dashboard-weeks">
        {shortcuts.map((s) => {
          const week = weeks?.find((w) => w.week_start === s.ws);
          return (
            <Card key={s.ws} variant="raised" padding={20} interactive>
              <a className="week-shortcut" href={`#/semana/${s.ws}`}>
                <span className="card-title">{s.label}</span>
                <span className="form-text">
                  {dayMonth(s.ws)} a {dayMonth(addDays(s.ws, 6))}: {!week ? 'sem montagem' : week.state === 'published' ? 'publicada' : 'em montagem'}
                </span>
              </a>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
