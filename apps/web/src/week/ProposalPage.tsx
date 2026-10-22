import { classifyTitle, isWeekPast, jaccard, JACCARD_MIN, localDate, titleWords } from '@cronograma/core';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTable, type CalendarSourceRow, type EventRow, type HistoryFactRow, type ServiceTypeRow } from '../data/catalog';
import { EventQuickView } from './EventQuickView';
import { useHistory } from '../data/history';
import { PageTitle } from '../layout/PageTitle';
import { navigate, type RouteProps } from '../router';
import { isFinished, useSettings } from '../settings/jobs';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { OnlineButton } from '../sync/OnlineButton';
import { Button, Card } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { DraftContext, proposeByHistory, type Draft, type DraftApi } from './historyProposal';
import { dayMonth, isMeetingEvent, needsTeam, publishSummary, slotState, type WeekRows } from './model';
import { changeType, NO_EVENTS, PreviewList, SourceAlerts } from './PreviewPage';
import { AI_OFF, isRunning, ProposalActions, ProposalMessage, useProposalRequest } from './ProposalBar';
import { ScheduleEditor, useSchedule } from './ScheduleEditor';
import { routeWeek } from './WeekPage';
import { useIdentifyTypes } from './useIdentifyTypes';
import { buildWeek, setPerson, useBuildPending, useNow, useWeekRows } from './useWeek';

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export interface TitleWords {
  words: Set<string>;
  typeId: string;
}

/**
 * Palavras de cada título do histórico, uma vez por título. Feito uma vez só quando o histórico chega: são
 * dezenas de milhares de linhas, e refazer isso a cada clique travava a tela.
 */
export function buildTitleIndex(history: readonly HistoryFactRow[] | null): TitleWords[] {
  const seen = new Set<string>();
  const out: TitleWords[] = [];
  for (const h of history ?? []) {
    if (!h.service_type_id || !h.title) continue;
    const key = `${h.service_type_id}|${h.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ words: titleWords(h.title), typeId: h.service_type_id });
  }
  return out;
}

/** Tipo sugerido para cada evento ainda sem tipo: palavra-chave primeiro, depois o título mais parecido do histórico. */
export function typeSuggestions(rows: WeekRows, index: readonly TitleWords[]): Map<string, ServiceTypeRow> {
  const out = new Map<string, ServiceTypeRow>();
  const missing = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled' && !e.service_type_id);
  if (missing.length === 0) return out;
  const types = rows.types.filter((t) => !t.archived_at);
  const byId = new Map(types.map((t) => [t.id, t]));
  const like = types.map((t) => ({ id: t.id, code: t.code, keywords: t.keywords ?? [] }));
  for (const e of missing) {
    const c = classifyTitle(e.title, like, []);
    let typeId = c.typeId;
    if (!typeId) {
      const target = titleWords(e.title);
      let best = 0;
      for (const h of index) {
        if (!byId.has(h.typeId)) continue;
        const score = jaccard(target, h.words);
        if (score > best) {
          best = score;
          typeId = h.typeId;
        }
      }
      if (best < JACCARD_MIN) typeId = null;
    }
    const type = typeId ? byId.get(typeId) : undefined;
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
  const [viewing, setViewing] = useState<string | null>(null);
  const viewed = viewing ? rows?.events.find((e) => e.id === viewing) : undefined;
  // Função estável: as linhas da lista são memorizadas e não se redesenham ao abrir a janela.
  const open = useCallback((e: EventRow) => setViewing(e.id), []);
  const titleIndex = useMemo(() => buildTitleIndex(history.rows), [history.rows]);

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
        <TypesStep rows={rows} sources={sources} today={today} now={now} titleIndex={titleIndex} onNext={() => setStep(2)} onOpenEvent={open} />
      ) : (
        <PeopleStep
          rows={rows}
          now={now}
          today={today}
          historyRows={history.rows}
          historyLoading={history.rows === null && history.status === 'loading'}
          onBack={() => setStep(1)}
          onOpenEvent={open}
        />
      )}
      {rows && viewed && <EventQuickView event={viewed} rows={rows} sources={sources} today={today} onClose={() => setViewing(null)} />}
    </section>
  );
}

interface TypesProps {
  rows: WeekRows;
  sources: readonly CalendarSourceRow[];
  today: string;
  now: Date;
  titleIndex: readonly TitleWords[];
  onNext: () => void;
  onOpenEvent: (e: EventRow) => void;
}

const isUntyped = (e: EventRow) => !e.service_type_id && e.status !== 'cancelled';

const EMPTY: ReadonlySet<string> = new Set();

/** Seleção pelo botão direito: o evento entra ou sai; 'clear' limpa. */
function selection(s: ReadonlySet<string>, action: EventRow | 'clear'): ReadonlySet<string> {
  if (action === 'clear') return EMPTY;
  const next = new Set(s);
  if (next.has(action.id)) next.delete(action.id);
  else next.add(action.id);
  return next;
}

function TypesStep({ rows, sources, today, now, titleIndex, onNext, onOpenEvent }: TypesProps) {
  const engine = useSyncEngine();
  const past = isWeekPast(rows.weekStart, now);
  const live = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled');
  const missing = live.filter((e) => !e.service_type_id);
  const suggestions = useMemo(() => typeSuggestions(rows, titleIndex), [rows, titleIndex]);
  const id = useIdentifyTypes(rows, !past);
  const [onlyMissing, setOnlyMissing] = useState(false);
  // O dispatch do reducer é estável: as linhas memorizadas da lista não se redesenham à toa.
  const [selected, toggle] = useReducer(selection, EMPTY);
  const [bulkType, setBulkType] = useState('');
  function applyBulk() {
    if (!bulkType) return;
    for (const e of rows.events) if (selected.has(e.id) && e.status !== 'cancelled') void changeType(engine, e, bulkType);
    toggle('clear');
    setBulkType('');
  }
  const notes: string[] = [];
  if (id.byKeyword) notes.push(`${plural(id.byKeyword, 'evento identificado', 'eventos identificados')} pelas palavras-chave.`);
  if (id.job && !isFinished(id.job)) notes.push('Identificando os outros pelo histórico e pela IA.');
  if (id.job?.status === 'done' && id.classified !== null) notes.push(`O histórico e a IA identificaram mais ${plural(id.classified, 'evento', 'eventos')}.`);
  if (id.job?.status === 'failed') notes.push(id.job.error ?? 'A identificação pela IA falhou.');

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
            {(missing.length > 0 || onlyMissing) && (
              <Button variant={onlyMissing ? 'primary' : 'secondary'} size="sm" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)}>
                {onlyMissing ? 'Mostrar todos' : `Só os sem tipo (${missing.length})`}
              </Button>
            )}
            {!past && missing.length > 0 && (
              <OnlineButton variant="ghost" size="sm" disabled={id.running} onClick={() => void id.identify()}>
                {id.running ? 'Identificando' : 'Identificar de novo'}
              </OnlineButton>
            )}
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
        {notes.length > 0 && (
          <p className="form-text identify-note" aria-live="polite">
            {notes.join(' ')}
          </p>
        )}
        {id.error && (
          <p className="form-message form-message--alert" role="alert">
            {id.error}
          </p>
        )}
        {!past && <p className="page-note">Dica: clique com o botão direito nos eventos para selecionar vários e definir o tipo de uma vez.</p>}
      </Card>
      {onlyMissing && missing.length === 0 && (
        <p className="form-text" role="note">
          Nenhum evento sem tipo. Tudo pronto para o próximo passo.
        </p>
      )}
      <PreviewList
        rows={rows}
        sources={sources}
        today={today}
        readOnly={past}
        highlight
        suggestions={suggestions}
        onOpenEvent={onOpenEvent}
        filter={onlyMissing ? isUntyped : undefined}
        selected={selected}
        onSelect={toggle}
      />
      {selected.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Eventos selecionados">
          <span className="bulk-count">{plural(selected.size, 'evento selecionado', 'eventos selecionados')}</span>
          <Select
            label="Tipo"
            aria-label="Tipo para os selecionados"
            value={bulkType}
            placeholder="Escolha o tipo"
            options={rows.types.filter((t) => !t.archived_at).map((t) => ({ value: t.id, label: t.name }))}
            onChange={(e) => setBulkType(e.target.value)}
            style={{ minWidth: 200 }}
          />
          <Button size="sm" disabled={!bulkType} onClick={applyBulk}>
            Definir tipo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggle('clear')}>
            Limpar seleção
          </Button>
        </div>
      )}
    </>
  );
}

interface PeopleProps {
  rows: WeekRows;
  now: Date;
  today: string;
  historyRows: readonly HistoryFactRow[] | null;
  /** O histórico ainda está chegando: a sugestão espera por ele (sem internet, segue sem). */
  historyLoading: boolean;
  onBack: () => void;
  onOpenEvent: (e: EventRow) => void;
}

function PeopleStep({ rows, now, today, historyRows, historyLoading, onBack, onOpenEvent }: PeopleProps) {
  const engine = useSyncEngine();
  const settings = useSettings();
  const { online } = useSyncState();
  const building = useBuildPending(rows.weekStart);
  const buildAsked = useRef(false);

  // Monta a semana (ou completa as vagas dos eventos que ganharam tipo depois da montagem) antes de propor.
  useEffect(() => {
    if (buildAsked.current) return;
    buildAsked.current = true;
    void buildWeek(engine, rows.weekStart);
  }, [engine, rows.weekStart]);

  if (!rows.week || !settings || historyLoading) {
    return (
      <Card variant="raised" padding={20}>
        <p className="form-text" role="status" style={{ margin: 0 }}>
          {!rows.week
            ? building && !online
              ? 'Montagem a enviar: conecte-se à internet para montar a semana e pedir a proposta.'
              : 'Montando a semana.'
            : historyLoading
              ? 'Lendo o histórico da equipe para sugerir a escala.'
              : 'Abrindo a proposta.'}
        </p>
      </Card>
    );
  }
  return (
    <ProposeAndReview
      rows={rows}
      now={now}
      today={today}
      historyRows={historyRows}
      historyLoading={false}
      aiOn={settings.ai_proposal_enabled}
      onBack={onBack}
      onOpenEvent={onOpenEvent}
    />
  );
}

function ProposeAndReview({ rows, now, today, historyRows, aiOn, onBack, onOpenEvent }: PeopleProps & { aiOn: boolean }) {
  const engine = useSyncEngine();
  const week = rows.week as NonNullable<WeekRows['week']>;
  const schedule = useSchedule(rows, now, today, historyRows);
  const { job, request, sending, requestedHere, error } = useProposalRequest(week);
  const pending = schedule.proposed.length;
  const [asking, setAsking] = useState(false);
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  // Reunião pelo tipo (REUNIAO ...): preenchida por último, depois de todas as outras demandas.
  const meetingEvents = new Set(rows.events.filter((e) => isMeetingEvent(e, rows.types)).map((e) => e.id));
  const isMeeting = (eventId: string) => meetingEvents.has(eventId);
  const suggest = () => proposeByHistory(schedule.ctx, schedule.index, isMeeting);
  // A escala sai do histórico na hora, no próprio app: a IA é só um pedido a mais, se quiserem.
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Draft>>(() => (schedule.readOnly ? new Map() : suggest()));
  // Sugestão vale só enquanto a vaga segue aberta (aceita, trocada à mão ou preenchida pela IA, ela some).
  const open = new Map([...drafts].filter(([slotId]) => slotState(schedule.model.bySlot.get(slotId)) === 'open'));
  const without = (slotId: string) => setDrafts((d) => new Map([...d].filter(([id]) => id !== slotId)));
  const draftApi: DraftApi = {
    drafts: open,
    accept: (slotId, a) => {
      const d = open.get(slotId);
      if (d) void setPerson(engine, a, d.personId, [], false);
      without(slotId);
    },
    discard: without,
  };
  function acceptAll() {
    for (const [slotId, d] of open) {
      const a = schedule.model.bySlot.get(slotId);
      if (a) void setPerson(engine, a, d.personId, [], false);
    }
    setDrafts(new Map());
  }

  const summary = publishSummary(rows);
  const empty = Math.max(0, summary.open - open.size);
  // Vaga vazia: sem ninguém escalado, proposto ou sugerido, de evento que pede equipe.
  const teamEvents = new Set(rows.events.filter((e) => needsTeam(e, rows.types)).map((e) => e.id));
  const isEmptySlot = (slotId: string) => {
    const s = schedule.model.rows.slots.find((x) => x.id === slotId);
    return Boolean(s && teamEvents.has(s.event_id)) && slotState(schedule.model.bySlot.get(slotId)) === 'open' && !open.has(slotId);
  };
  const running = sending || isRunning(job);
  return (
    <>
      <Card variant="raised" padding={20}>
        <section aria-label="Proposta de pessoas" className="proposal-bar">
          <p className="form-text" role="status" style={{ margin: 0 }}>
            {open.size > 0
              ? `${plural(open.size, 'sugestão', 'sugestões')} pelo histórico: quem mais fez cada função em cada tipo de serviço, livre no horário e dentro do limite de horas.`
              : 'Nenhuma sugestão nova: as vagas abertas não têm ninguém apto (função, horário, ausência ou limite de horas).'}
          </p>
          <p className="form-text" style={{ margin: 0 }}>
            {plural(summary.filled, 'vaga confirmada', 'vagas confirmadas')}, {plural(open.size, 'sugestão para revisar', 'sugestões para revisar')}
            {pending > 0 ? `, ${plural(pending, 'proposta da IA', 'propostas da IA')}` : ''} e {plural(empty, 'vaga vazia', 'vagas vazias')}
            {empty > 0 ? ', em destaque na lista.' : '.'}
          </p>
          <ProposalMessage job={job} requestedHere={requestedHere} />
          {error && (
            <p className="form-message form-message--alert" role="alert">
              {error}
            </p>
          )}
          <div className="week-actions-buttons">
            <Button variant="ghost" size="sm" onClick={onBack}>
              Voltar aos tipos
            </Button>
            {open.size > 0 && !schedule.readOnly && (
              <>
                <Button size="sm" onClick={acceptAll}>
                  Aceitar todas as sugestões
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDrafts(new Map())}>
                  Descartar as sugestões
                </Button>
              </>
            )}
            {!schedule.readOnly && (
              <Button size="sm" variant="secondary" onClick={() => setDrafts(suggest())}>
                Sugerir de novo
              </Button>
            )}
            {pending > 0 && !schedule.readOnly && <ProposalActions proposed={schedule.proposed} />}
            {aiOn && !schedule.readOnly && (
              <OnlineButton variant="ghost" size="sm" disabled={running} onClick={() => (pending > 0 ? setAsking(true) : void request(true))}>
                {running ? 'A IA está propondo' : 'Pedir à IA'}
              </OnlineButton>
            )}
            <Button size="sm" variant="secondary" onClick={() => navigate(`/semana/${rows.weekStart}`)}>
              Concluir
            </Button>
          </div>
          {!aiOn && (
            <p className="page-note" role="note">
              {AI_OFF}
            </p>
          )}
        </section>
      </Card>
      <div className="week-actions-buttons list-tools">
        <Button size="sm" variant={onlyEmpty ? 'primary' : 'secondary'} aria-pressed={onlyEmpty} onClick={() => setOnlyEmpty(!onlyEmpty)}>
          {onlyEmpty ? 'Mostrar todas as vagas' : `Só vagas vazias (${empty})`}
        </Button>
        {!onlyEmpty && (
          <Button size="sm" variant="ghost" aria-pressed={expandAll} onClick={() => setExpandAll(!expandAll)}>
            {expandAll ? 'Recolher todos os eventos' : 'Abrir todos os eventos'}
          </Button>
        )}
      </div>
      {onlyEmpty && empty === 0 && (
        <p className="form-text" role="note">
          Nenhuma vaga vazia: todas têm alguém escalado, proposto ou sugerido.
        </p>
      )}
      <DraftContext.Provider value={draftApi}>
        <ScheduleEditor
          schedule={schedule}
          today={today}
          onOpenEvent={onOpenEvent}
          collapsible
          expandAll={expandAll}
          slotFilter={onlyEmpty ? isEmptySlot : undefined}
        />
      </DraftContext.Provider>
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
