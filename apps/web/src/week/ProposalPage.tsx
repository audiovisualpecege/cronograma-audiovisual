import { classifyTitle, isWeekPast, localDate, type TitleIndex } from '@cronograma/core';
import { useEffect, useRef, useState } from 'react';
import { useTable, type CalendarSourceRow, type HistoryFactRow, type ServiceTypeRow } from '../data/catalog';
import { useHistory } from '../data/history';
import { PageTitle } from '../layout/PageTitle';
import { navigate, type RouteProps } from '../router';
import { useSettings } from '../settings/jobs';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { OnlineButton } from '../sync/OnlineButton';
import { Button, Card } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { dayMonth, publishSummary, type WeekRows } from './model';
import { changeType, NO_EVENTS, PreviewList, SourceAlerts } from './PreviewPage';
import { AI_OFF, isRunning, ProposalActions, ProposalMessage, useProposalRequest } from './ProposalBar';
import { ScheduleEditor, useSchedule } from './ScheduleEditor';
import { routeWeek } from './WeekPage';
import { buildWeek, useBuildPending, useNow, useWeekRows } from './useWeek';

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Tipo sugerido pelo histórico (títulos parecidos) para cada evento ainda sem tipo. */
export function typeSuggestions(rows: WeekRows, history: readonly HistoryFactRow[] | null): Map<string, ServiceTypeRow> {
  const out = new Map<string, ServiceTypeRow>();
  const missing = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled' && !e.service_type_id);
  if (missing.length === 0) return out;
  const types = rows.types.filter((t) => !t.archived_at);
  const like = types.map((t) => ({ id: t.id, code: t.code, keywords: t.keywords ?? [] }));
  const seen = new Set<string>();
  const index: TitleIndex = [];
  for (const h of history ?? []) {
    if (!h.service_type_id || !h.title) continue;
    const key = `${h.service_type_id}|${h.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    index.push({ title: h.title, serviceTypeId: h.service_type_id });
  }
  for (const e of missing) {
    const c = classifyTitle(e.title, like, index);
    const type = c.typeId ? types.find((t) => t.id === c.typeId) : undefined;
    if (type) out.set(e.id, type);
  }
  return out;
}

function Steps({ step }: { step: 1 | 2 }) {
  const items = ['Tipos de serviço', 'Pessoas'];
  return (
    <ol className="steps" aria-label="Passos da proposta">
      {items.map((label, i) => (
        <li key={label} className={`step${step === i + 1 ? ' is-current' : ''}${step > i + 1 ? ' is-done' : ''}`} aria-current={step === i + 1 ? 'step' : undefined}>
          <span className="step-number">{i + 1}</span>
          <span className="step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Propor escala" em dois passos: (1) os tipos de serviço dos eventos, com as sugestões do histórico e
 * os que faltam em destaque; (2) a semana montada e a proposta de pessoas pela IA, para revisar ali
 * mesmo, com as vagas que ficaram vazias em destaque.
 */
export function ProposalPage({ params }: RouteProps) {
  const now = useNow();
  const today = localDate(now);
  const weekStart = routeWeek(params.date, now);
  const rows = useWeekRows(weekStart);
  const sources = useTable<CalendarSourceRow>('calendar_sources') ?? [];
  const history = useHistory();
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <section className="page week-page proposal-page">
      <div className="page-head">
        <PageTitle light="PROPOR ESCALA DA SEMANA DE" black={dayMonth(weekStart)} />
        <Button variant="ghost" size="sm" onClick={() => navigate(`/semana/${weekStart}`)}>
          Voltar para a semana
        </Button>
      </div>
      <Steps step={step} />
      <SourceAlerts sources={sources} />
      {!rows ? (
        <p className="form-text">Abrindo a semana.</p>
      ) : step === 1 ? (
        <TypesStep rows={rows} sources={sources} today={today} now={now} historyRows={history.rows} onNext={() => setStep(2)} />
      ) : (
        <PeopleStep rows={rows} now={now} today={today} historyRows={history.rows} onBack={() => setStep(1)} />
      )}
    </section>
  );
}

interface TypesProps {
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  today: string;
  now: Date;
  historyRows: readonly HistoryFactRow[] | null;
  onNext: () => void;
}

function TypesStep({ rows, sources, today, now, historyRows, onNext }: TypesProps) {
  const engine = useSyncEngine();
  const past = isWeekPast(rows.weekStart, now);
  const live = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled');
  const missing = live.filter((e) => !e.service_type_id);
  const suggestions = typeSuggestions(rows, historyRows);

  if (live.length === 0) {
    return (
      <Card variant="raised" padding={24}>
        <p className="form-text" style={{ margin: 0 }}>
          {NO_EVENTS}.
        </p>
      </Card>
    );
  }
  return (
    <>
      <Card variant="raised" padding={20}>
        <div className="week-actions">
          <p className="form-text" style={{ margin: 0 }} role="status">
            {missing.length === 0
              ? `Todos os ${live.length} eventos têm tipo de serviço. Siga para a proposta de pessoas.`
              : `${live.length - missing.length} de ${live.length} eventos com tipo. ${plural(missing.length, 'evento sem tipo está', 'eventos sem tipo estão')} em destaque: escolha o tipo para seguir.`}
          </p>
          <span className="week-actions-buttons">
            {!past && suggestions.size > 0 && (
              <Button variant="secondary" size="sm" onClick={() => rows.events.forEach((e) => suggestions.has(e.id) && void changeType(engine, e, suggestions.get(e.id)?.id ?? null))}>
                {suggestions.size === 1 ? 'Usar a sugestão do histórico' : `Usar as ${suggestions.size} sugestões do histórico`}
              </Button>
            )}
            <Button size="sm" onClick={onNext} disabled={past || missing.length > 0}>
              Próximo passo
            </Button>
          </span>
        </div>
      </Card>
      <PreviewList rows={rows} sources={sources} today={today} readOnly={past} highlight suggestions={suggestions} />
    </>
  );
}

interface PeopleProps {
  rows: WeekRows;
  now: Date;
  today: string;
  historyRows: readonly HistoryFactRow[] | null;
  onBack: () => void;
}

function PeopleStep({ rows, now, today, historyRows, onBack }: PeopleProps) {
  const engine = useSyncEngine();
  const settings = useSettings();
  const { online } = useSyncState();
  const building = useBuildPending(rows.weekStart);
  const buildAsked = useRef(false);

  // Semana sem montagem: monta primeiro, para os eventos ganharem as vagas pelos tipos.
  useEffect(() => {
    if (rows.week || buildAsked.current) return;
    buildAsked.current = true;
    void buildWeek(engine, rows.weekStart);
  }, [rows.week, engine, rows.weekStart]);

  if (!rows.week || !settings) {
    return (
      <Card variant="raised" padding={20}>
        <p className="form-text" role="status" style={{ margin: 0 }}>
          {rows.week ? 'Abrindo a proposta.' : building && !online ? 'Montagem a enviar: conecte-se à internet para montar a semana e pedir a proposta.' : 'Montando a semana.'}
        </p>
      </Card>
    );
  }
  return <ProposeAndReview rows={rows} now={now} today={today} historyRows={historyRows} aiOn={settings.ai_proposal_enabled} onBack={onBack} />;
}

function ProposeAndReview({ rows, now, today, historyRows, aiOn, onBack }: Omit<PeopleProps, 'onBack'> & { aiOn: boolean; onBack: () => void }) {
  const week = rows.week as NonNullable<WeekRows['week']>;
  const schedule = useSchedule(rows, now, today, historyRows);
  const { job, request, sending, requestedHere, error } = useProposalRequest(week);
  const pending = schedule.proposed.length;
  const canPropose = aiOn && !schedule.readOnly;
  // Ao chegar: sem propostas pendentes, pede à IA na hora; com pendentes, pergunta antes se substitui.
  const [arrival] = useState(() => (canPropose ? (pending > 0 ? 'ask' : 'request') : 'none'));
  const [asking, setAsking] = useState(arrival === 'ask');
  const requested = useRef(false);
  useEffect(() => {
    if (arrival !== 'request' || requested.current) return;
    requested.current = true;
    void request(true);
  }, [arrival, request]);

  const summary = publishSummary(rows);
  const running = sending || isRunning(job);
  return (
    <>
      <Card variant="raised" padding={20}>
        <section aria-label="Proposta de pessoas" className="proposal-bar">
          {!aiOn && (
            <p className="form-text" role="note" style={{ margin: 0 }}>
              {AI_OFF}
            </p>
          )}
          <ProposalMessage job={job} requestedHere={requestedHere} />
          {error && (
            <p className="form-message form-message--alert" role="alert">
              {error}
            </p>
          )}
          <p className="form-text" style={{ margin: 0 }}>
            {plural(summary.filled, 'vaga confirmada', 'vagas confirmadas')}, {plural(summary.proposed, 'proposta para revisar', 'propostas para revisar')} e{' '}
            {plural(summary.open, 'vaga vazia', 'vagas vazias')}
            {summary.open > 0 ? ', em destaque na lista.' : '.'}
          </p>
          <div className="week-actions-buttons">
            <Button variant="ghost" size="sm" onClick={onBack}>
              Voltar aos tipos
            </Button>
            {pending > 0 && !schedule.readOnly && <ProposalActions proposed={schedule.proposed} />}
            {aiOn && !schedule.readOnly && (
              <OnlineButton variant="secondary" size="sm" disabled={running} onClick={() => (pending > 0 ? setAsking(true) : void request(true))}>
                {running ? 'Propondo escala' : 'Propor de novo'}
              </OnlineButton>
            )}
            <Button size="sm" onClick={() => navigate(`/semana/${rows.weekStart}`)}>
              Concluir
            </Button>
          </div>
        </section>
      </Card>
      <ScheduleEditor schedule={schedule} today={today} />
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Propor escala"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAsking(false);
                void request(false);
              }}
            >
              Manter as pendentes
            </Button>
            <Button
              onClick={() => {
                setAsking(false);
                void request(true);
              }}
            >
              Substituir
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{pending === 1 ? 'Substituir a proposta pendente?' : `Substituir as ${pending} propostas pendentes?`} As alocações aceitas não mudam.</p>
      </Dialog>
    </>
  );
}
