import { addDays, localDate, weekStartOf } from '@cronograma/core';
import {
  AddCircleIcon,
  CalendarIcon,
  CheckCircleIcon,
  CloseCircleIcon,
  PenNewSquareIcon,
  RefreshCircleIcon,
  RestartIcon,
} from '@solar-icons/react/bold-duotone';
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
import { Badge, Card } from '../../ui/chiaro';
import { formatStamp } from '../../ui/format';
import { dayMonth } from '../../week/model';
import { SourceAlerts } from '../../week/PreviewPage';
import { RereadButton } from '../../week/RereadButton';
import { Seal } from '../../week/Seal';
import { useNow } from '../../week/useWeek';
import { agendaNotices, dashboardPending, plural, weekCards, workerAlert, type WeekCard } from './pending';

const KIND_LABEL = {
  review: 'agenda',
  unpublished: 'não publicada',
  open: 'sem escala',
  proposed: 'proposta',
  duplicate: 'duplicado',
  unbuilt: 'sem montagem',
} as const;

const WEEK_LABEL = ['Esta semana', 'Próxima semana', 'Daqui a 2 semanas'];

const NOTICE_ICON = {
  new: AddCircleIcon,
  changed: RefreshCircleIcon,
  cancelled: CloseCircleIcon,
  restored: RestartIcon,
} as const;

const STATE = {
  published: { label: 'Publicada', tone: 'success', icon: CheckCircleIcon },
  building: { label: 'Em montagem', tone: 'brand', icon: PenNewSquareIcon },
  unbuilt: { label: 'Sem montagem', tone: 'soft', icon: CalendarIcon },
} as const;

/** O que falta na semana, em uma linha: eventos e, com a semana montada, vagas, propostas e alterações. */
function cardDetail(c: WeekCard): string {
  const parts = [plural(c.events, 'evento', 'eventos')];
  if (c.state === 'unbuilt') parts.push(c.events > 0 ? 'escala ainda não montada' : 'nada na agenda');
  if (c.open > 0) parts.push(plural(c.open, 'vaga sem escala', 'vagas sem escala'));
  if (c.proposed > 0) parts.push(plural(c.proposed, 'proposta para revisar', 'propostas para revisar'));
  if (c.changes > 0) parts.push(plural(c.changes, 'alteração não publicada', 'alterações não publicadas'));
  if (c.state !== 'unbuilt' && c.open + c.proposed + c.changes === 0) parts.push('escala completa');
  return parts.join(', ');
}

function WeekCardView({ card, label, current }: { card: WeekCard; label: string; current: boolean }) {
  const state = STATE[card.state];
  return (
    // O link ocupa o cartão todo (padding 0 no Card): o tom mais claro do hover cobre o cartão inteiro.
    <Card variant="raised" padding={0} interactive>
      <a
        className={`week-card${current ? ' week-card--current' : ''}`}
        href={`#/semana/${card.weekStart}`}
        aria-label={`${label}: semana de ${dayMonth(card.weekStart)}, ${state.label.toLowerCase()}`}
        aria-current={current ? 'date' : undefined}
      >
        <span className={`week-card-icon week-card-icon--${card.state}`}>
          <AppIcon icon={state.icon} size={32} />
        </span>
        <span className="week-card-body">
          <span className="week-card-label">{label}</span>
          <span className="card-title">Semana de {dayMonth(card.weekStart)}</span>
          <span className="form-text">
            {dayMonth(card.weekStart)} a {dayMonth(addDays(card.weekStart, 6))}
          </span>
          <Badge tone={state.tone}>{state.label}</Badge>
          <span className="week-card-detail">{cardDetail(card)}</span>
        </span>
      </a>
    </Card>
  );
}

/**
 * Painel do administrador (US-001 AC-2): as próximas 3 semanas em cartões, os avisos da agenda dessas
 * semanas e, por último, as pendências; mais a saúde do serviço de fundo e das agendas.
 */
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
  const current = weekStartOf(today);
  const starts = useMemo(() => [0, 1, 2].map((i) => addDays(current, 7 * i)), [current]);

  // O painel recalcula quando as tabelas mudam; o relógio só pesa na virada da semana.
  /* eslint-disable react-hooks/exhaustive-deps */
  const input = useMemo(() => (ready ? { events, weeks, slots, assignments, published, types, now } : null), [ready, events, weeks, slots, assignments, published, types, today]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const items = useMemo(() => (input ? dashboardPending(input) : []), [input]);
  const cards = useMemo(() => (input ? weekCards(input, starts) : []), [input, starts]);
  const notices = useMemo(() => (events ? agendaNotices(events, starts) : []), [events, starts]);
  const worker = settings ? workerAlert(settings.worker_seen_at, now) : null;
  const loading = !ready || (!lastSyncAt && (events?.length ?? 0) === 0);

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
      <div className="dashboard-weeks" aria-label="Próximas semanas" role="list">
        {cards.map((c, i) => (
          <div key={c.weekStart} role="listitem" className={i === 0 ? 'week-card-slot week-card-slot--current' : 'week-card-slot'}>
            <WeekCardView card={c} label={WEEK_LABEL[i] ?? ''} current={i === 0} />
          </div>
        ))}
      </div>
      <Card variant="raised" padding={24}>
        <section aria-labelledby="avisos-title">
          <h2 id="avisos-title" className="section-title">
            Avisos da agenda
          </h2>
          {loading ? (
            <p className="form-text">Buscando os avisos.</p>
          ) : notices.length === 0 ? (
            <p className="form-text">Nenhuma mudança da agenda nas próximas 3 semanas.</p>
          ) : (
            <ul className="plain-list notice-list" aria-label="Avisos da agenda">
              {notices.map((n) => (
                <li key={n.key} className={`notice notice--${n.kind}`}>
                  <span className="notice-icon">
                    <AppIcon icon={NOTICE_ICON[n.kind]} size={22} />
                  </span>
                  <a className="notice-text" href={`#${n.link}`}>
                    {n.text}
                  </a>
                  <span className="notice-time">{formatStamp(n.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>
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
    </section>
  );
}
