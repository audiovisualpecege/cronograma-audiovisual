import { DangerTriangleIcon } from '@solar-icons/react/bold-duotone';
import { buildSeriesSizes, personLoad, SIZE_LABEL, weekStartOf, zonedTime, type EventSize, type SizeSuggestion, type WeekContext } from '@cronograma/core';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { googleColor, useLocalGoogleColors } from './googleColors';
import { sizeFor, toFact, type AssignmentRow, type EventRow, type HistoryFactRow, type ServiceTypeRow, type SlotRow } from '../data/catalog';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';
import { Button } from '../ui/chiaro';
import { typeIcon } from '../ui/typeIcons';
import { isSimulating, learnPreviewCrew } from '../dev/sizePreview';
import {
  activityKind,
  boardCounts,
  boardDays,
  chipState,
  crewOrigin,
  eventAlerts,
  isPlanned,
  isReserved,
  knownSeries,
  plannedRows,
  reviewReasons,
  shortTitle,
  slotKeys,
  timelineLayout,
  timeOffAbsences,
  titularAsks,
  type BoardCounts,
  type BoardDay,
  type ChipState,
  type TitularAsk,
} from './board';
import { EventSeals } from './EventSeals';
import { proposeByHistory, type Draft } from './historyProposal';
import {
  activitiesText,
  autoSizes,
  eventSpan,
  hoursText,
  isMarker,
  isMeetingEvent,
  needsTeam,
  sizedType,
  sizeSuggestions,
  slotState,
  WARNING_LABEL,
  weekTimeOff,
  type AutoSize,
  type TimeOff,
  type WeekRows,
} from './model';
import { PersonPicker } from './PersonPicker';
import { changeSize, changeType } from './PreviewPage';
import { useSchedule } from './schedule';
import { Seal } from './Seal';
import { TIME_OFF } from './timeOffIcons';
import { buildTitleIndex, typeSuggestions } from './typeSuggestions';
import { acceptProposal, addSlot, buildWeek, clearSlot, discardProposal, removeSlot, sendAndRefresh, setPerson, setSeriesTitular, useBuildPending } from './useWeek';

const NO_DRAFTS: ReadonlyMap<string, Draft> = new Map();

/** Confirmar a sugestão que já leva alerta (fora do horário) é escalar mesmo assim. */
const draftPick = (slotId: string, d: Draft): Pick => ({ slotId, personId: d.personId, warnings: d.warnings ?? [], override: Boolean(d.warnings?.length) });

/**
 * Escolha feita numa vaga prevista: gravada na vaga de verdade assim que a montagem a criar. Com `remove`, a vaga
 * prevista sai: some da tela na hora e é tirada assim que a montagem a criar.
 */
interface QueuedPick {
  key: string;
  personId: string;
  warnings: string[];
  override: boolean;
  remove?: boolean;
}

interface Pick {
  slotId: string;
  personId: string;
  warnings?: string[];
  override?: boolean;
}

/** Onde o placar leva: a primeira ficha da situação, o primeiro aviso ou o próximo cartão para revisar. */
export type BoardTarget = ChipState | 'alert' | 'review';

export interface BoardState {
  counts: BoardCounts;
  /** "Só o que precisa de olho": apaga os cartões sem pendência. */
  onlyReview: boolean;
  toggleReview: () => void;
  /** Sugestões e propostas que "Confirmar sugestões" grava. */
  toConfirm: number;
  confirmAll: () => void;
  /** Sugestões ainda não confirmadas (não vão para a equipe ao publicar). */
  drafts: number;
  historyLoading: boolean;
}

interface BoardProps {
  rows: WeekRows;
  now: Date;
  today: string;
  historyRows: readonly HistoryFactRow[] | null;
  historyLoading: boolean;
  onOpenEvent: (eventId: string) => void;
  /** Evento aberto no painel da direita; o painel recebe as vagas dele, editáveis como na grade. */
  viewing?: string | null;
  renderPanel?: (event: EventRow, crew: ReactNode) => ReactNode;
  /** A barra do topo (placar e "Confirmar sugestões") fica na página; a grade passa o que ela mostra e a troca de visualização. */
  renderBar: (state: BoardState, scrollTo: (what: BoardTarget) => void, viewSwitch: ReactNode) => ReactNode;
}

/**
 * Grade da semana: uma coluna por dia com atividade, cada atividade num cartão com as vagas em fichas (verde
 * confirmada, tracejada sugestão ou proposta, vermelha aberta) e as folgas no topo do dia. Nas semanas futuras,
 * as vagas abertas já vêm com a sugestão do histórico; nada grava sem confirmar. Semana ainda sem montagem mostra
 * as vagas previstas e monta sozinha na primeira confirmação.
 */
export function WeekBoard({ rows, now, today, historyRows, historyLoading, onOpenEvent, viewing = null, renderPanel, renderBar }: BoardProps) {
  const engine = useSyncEngine();
  const localColors = useLocalGoogleColors();
  const colorOf = useMemo(() => {
    const cache = new Map<string, string>();
    return (e: EventRow) => {
      const key = `${e.id}|${e.service_type_id ?? ''}|${e.color_id ?? ''}`;
      if (!cache.has(key)) cache.set(key, googleColor(e, { types: rows.types, local: localColors }));
      return cache.get(key) ?? null;
    };
  }, [rows.types, localColors]);
  const { pendingRows } = useSyncState();
  const building = useBuildPending(rows.weekStart);
  // Semana sem montagem: as vagas que a montagem criaria, com o porte da série aplicado sozinho.
  const seriesSizes = useMemo(() => buildSeriesSizes((historyRows ?? []).map(toFact)), [historyRows]);
  const auto = useMemo(() => autoSizes(rows, seriesSizes), [rows, seriesSizes]);
  const planned = useMemo(() => plannedRows(rows, auto), [rows, auto]);
  const keys = useMemo(() => slotKeys(planned.slots), [planned.slots]);
  // Escolhas e vagas tiradas em vagas previstas, gravadas quando a montagem criar as vagas.
  const [queue, setQueue] = useState<QueuedPick[]>([]);
  const queued = useMemo(() => new Map(queue.filter((q) => !q.remove).map((q) => [q.key, q])), [queue]);
  const removed = useMemo(() => new Set(queue.filter((q) => q.remove).map((q) => q.key)), [queue]);
  const board = useMemo(() => {
    if (removed.size === 0) return planned;
    const gone = new Set(planned.slots.filter((s) => removed.has(keys.get(s.id) ?? '')).map((s) => s.id));
    return { ...planned, slots: planned.slots.filter((s) => !gone.has(s.id)), assignments: planned.assignments.filter((a) => !gone.has(a.slot_id)) };
  }, [planned, removed, keys]);
  const schedule = useSchedule(board, now, today, historyRows);
  const { model, index, readOnly } = schedule;
  const built = Boolean(rows.week);

  // Folgas: as da agenda valem até alguém desmarcar na faixa do dia.
  const timeOff = useMemo(() => weekTimeOff(rows), [rows]);
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const ctx = useMemo<WeekContext>(() => ({ ...schedule.ctx, absences: [...schedule.ctx.absences, ...timeOffAbsences(timeOff, dropped)] }), [schedule.ctx, timeOff, dropped]);
  const days = useMemo(() => boardDays(board, timeOff), [board, timeOff]);
  const cardTypes = useMemo(() => {
    const ids = new Set(days.flatMap((d) => d.cards.map((e) => e.service_type_id ?? null)));
    return [...ids].map((id) => board.types.find((t) => t.id === id));
  }, [days, board.types]);

  // Sugestões: só nas semanas futuras, pelo histórico. "Deixar vaga" tira a vaga da sugestão (pela chave estável).
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const suggesting = !readOnly && rows.weekStart > weekStartOf(today) && !historyLoading;
  // A sugestão da semana toda leva um tempo numa semana grande: a grade aparece antes e as sugestões chegam logo
  // depois, refeitas a cada mudança.
  const [proposed, setProposed] = useState<ReadonlyMap<string, Draft>>(NO_DRAFTS);
  useEffect(() => {
    if (!suggesting) return;
    const timer = window.setTimeout(() => {
      const meetings = new Set(board.events.filter((e) => isMeetingEvent(e, board.types)).map((e) => e.id));
      // A proposta do serviço de fundo segura a pessoa como se estivesse confirmada: ninguém é sugerido em dobro.
      const assignments = ctx.assignments.map((a) => (a.status === 'proposed' ? { ...a, status: 'confirmed' as const } : a));
      const slots = ctx.slots.filter((s) => !dismissed.has(keys.get(s.id) ?? ''));
      setProposed(proposeByHistory({ ...ctx, slots, assignments }, index, (id) => meetings.has(id)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [suggesting, board, ctx, dismissed, keys, index]);
  // Sugestão só vale enquanto a vaga segue aberta e não foi deixada vaga.
  const drafts = useMemo(
    () =>
      suggesting
        ? new Map([...proposed].filter(([slotId]) => slotState(model.bySlot.get(slotId)) === 'open' && !dismissed.has(keys.get(slotId) ?? '')))
        : NO_DRAFTS,
    [suggesting, proposed, model.bySlot, dismissed, keys],
  );

  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!rows.week || queue.length === 0) return;
    const realKeys = slotKeys(rows.slots);
    const byKey = new Map([...realKeys].map(([id, k]) => [k, id]));
    const bySlot = new Map(rows.assignments.map((a) => [a.slot_id, a]));
    const done: string[] = [];
    const writes: Promise<unknown>[] = [];
    for (const q of queue) {
      if (sent.current.has(q.key)) continue;
      const slotId = byKey.get(q.key);
      const a = slotId ? bySlot.get(slotId) : undefined;
      if (a) {
        sent.current.add(q.key);
        done.push(q.key);
        const real = rows.slots.find((s) => s.id === slotId);
        if (q.remove && real) writes.push(removeSlot(engine, real));
        else if (!q.remove && slotState(a) === 'open') writes.push(setPerson(engine, a, q.personId, q.warnings, q.override));
        continue;
      }
      // A vaga ainda não chegou da montagem: espera; se o evento já tem vagas e não esta, a escolha se perde.
      const eventId = q.key.split('|')[0];
      if (rows.slots.some((s) => s.event_id === eventId)) done.push(q.key);
    }
    if (done.length === 0) return;
    void Promise.all(writes).then(() => setQueue((list) => list.filter((x) => !done.includes(x.key))));
  }, [rows, queue, engine]);

  function confirm(picks: readonly Pick[]) {
    const later: QueuedPick[] = [];
    for (const p of picks) {
      if (isPlanned(p.slotId)) {
        const key = keys.get(p.slotId);
        if (key) later.push({ key, personId: p.personId, warnings: p.warnings ?? [], override: p.override ?? false });
        continue;
      }
      const a = model.bySlot.get(p.slotId);
      if (a) void setPerson(engine, a, p.personId, p.warnings ?? [], p.override ?? false);
    }
    if (later.length === 0) return;
    setQueue((q) => [...q.filter((x) => !later.some((l) => l.key === x.key)), ...later]);
    if (!rows.week && !building) void buildWeek(engine, rows.weekStart, auto);
  }

  const dismiss = (slotId: string) => setDismissed((s) => new Set([...s, keys.get(slotId) ?? slotId]));
  const unqueue = (slotId: string) => setQueue((q) => q.filter((x) => x.key !== keys.get(slotId)));

  // Pôr e tirar vaga: vale para o evento e ensina a série (no banco, migração 0021; na simulação, no navegador).
  const roleIdsOf = (eventId: string) => (model.slotsByEvent.get(eventId) ?? []).map((s) => s.job_role_id);
  function addRole(e: EventRow, roleId: string) {
    if (isSimulating() && e.service_type_id) learnPreviewCrew(e.title, e.service_type_id, [...roleIdsOf(e.id), roleId]);
    void (async () => {
      if (!rows.week) await buildWeek(engine, rows.weekStart, auto);
      await addSlot(engine, e.id, roleId);
      await sendAndRefresh(engine, ['slots', 'assignments']);
    })();
  }
  function dropSlot(slotId: string) {
    const slot = board.slots.find((s) => s.id === slotId);
    const e = slot && board.events.find((x) => x.id === slot.event_id);
    if (!slot || !e) return;
    if (isSimulating() && e.service_type_id) {
      const rest = (model.slotsByEvent.get(e.id) ?? []).filter((s) => s.id !== slotId).map((s) => s.job_role_id);
      learnPreviewCrew(e.title, e.service_type_id, rest);
    }
    if (isPlanned(slotId)) {
      const key = keys.get(slotId);
      if (!key) return;
      setQueue((q) => [...q.filter((x) => x.key !== key), { key, personId: '', warnings: [], override: false, remove: true }]);
      if (!rows.week && !building) void buildWeek(engine, rows.weekStart, auto);
      return;
    }
    void removeSlot(engine, slot).then(() => sendAndRefresh(engine, ['slots', 'assignments']));
  }

  const base = useMemo(() => boardCounts(model, drafts, built), [model, drafts, built]);
  const toConfirm = drafts.size + schedule.proposed.length;
  function confirmAll() {
    confirm([...drafts].map(([slotId, d]) => draftPick(slotId, d)));
    for (const a of schedule.proposed) void acceptProposal(engine, a);
  }

  // "Virou o titular?": a mesma troca nas duas últimas vezes da série. A resposta grava a turma fixa.
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const asks = useMemo(() => {
    if (!suggesting) return new Map<string, TitularAsk[]>();
    const out = new Map<string, TitularAsk[]>();
    for (const a of titularAsks(board, model.slotsByEvent, historyRows)) {
      if (answered.has(`${a.series}|${a.roleId}`)) continue;
      out.set(a.eventId, [...(out.get(a.eventId) ?? []), a]);
    }
    return out;
  }, [suggesting, board, model.slotsByEvent, historyRows, answered]);
  function answer(a: TitularAsk, yes: boolean) {
    setAnswered((s) => new Set([...s, `${a.series}|${a.roleId}`]));
    const people = yes ? [a.personId, a.current] : [a.current, a.personId];
    void setSeriesTitular(engine, a.series, a.roleId, people.filter((p): p is string => Boolean(p))).catch(() => undefined);
  }

  // Revisão só das exceções: cada cartão com o porquê de precisar de olho.
  const known = useMemo(() => (historyLoading ? null : knownSeries(historyRows)), [historyLoading, historyRows]);
  const reviews = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const e of model.events) {
      if (isMarker(e, board.types)) continue;
      const input = { slots: model.slotsByEvent.get(e.id) ?? [], bySlot: model.bySlot, drafts, built, types: board.types, known, asks: asks.get(e.id)?.length ?? 0 };
      const reasons = reviewReasons(e, input);
      if (reasons.length > 0) out.set(e.id, reasons);
    }
    return out;
  }, [model, board.types, drafts, built, known, asks]);
  const counts = useMemo(() => ({ ...base, review: reviews.size }), [base, reviews]);
  const [onlyReview, setOnlyReview] = useState(false);

  // Tipo e porte sugeridos pelo histórico, no cartão. Sem montagem, o porte já vai sozinho (auto).
  const titleIndex = useMemo(() => buildTitleIndex(historyRows), [historyRows]);
  const typeHints = useMemo(() => typeSuggestions(rows, titleIndex), [rows, titleIndex]);
  const sizeHints = useMemo(() => (built ? sizeSuggestions(rows, seriesSizes) : new Map<string, SizeSuggestion>()), [built, rows, seriesSizes]);

  // Passar o mouse numa ficha acende a mesma pessoa na semana toda.
  const [lit, setLit] = useState<string | null>(null);
  const litLoad = lit ? personLoad(lit, ctx) : null;

  const [menu, setMenu] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const pickSlot = picking ? board.slots.find((s) => s.id === picking) : undefined;
  const pickEvent = pickSlot ? board.events.find((e) => e.id === pickSlot.event_id) : undefined;
  const pickAssignment = picking ? model.bySlot.get(picking) : undefined;
  const viewedEvent = viewing ? board.events.find((e) => e.id === viewing) : undefined;

  // Grade (a semana em colunas) ou linha do tempo (um dia por vez, com as horas de cima para baixo).
  const [view, setView] = useState<BoardView>(readView);
  const chooseView = (v: BoardView) => {
    setView(v);
    saveView(v);
  };
  const [dayAt, setDayAt] = useState(() => firstDay(days, today));
  const [dayWeek, setDayWeek] = useState(rows.weekStart);
  if (dayWeek !== rows.weekStart) {
    setDayWeek(rows.weekStart);
    setDayAt(firstDay(days, today));
  }

  const boardId = useId();
  // O placar procura nos outros dias quando a linha do tempo não mostra o que ele pede.
  const pendingGo = useRef<BoardTarget | null>(null);
  function dayHas(day: BoardDay, what: BoardTarget): boolean {
    return day.cards.some((e) => {
      const slots = model.slotsByEvent.get(e.id) ?? [];
      if (what === 'review') return reviews.has(e.id);
      if (what === 'alert') return eventAlerts(e, slots.length, built, board.types).length > 0;
      return slots.some((s) => chipState(model.bySlot.get(s.id), drafts.get(s.id)) === what);
    });
  }
  // "Próximo": o cartão para revisar depois do que está em foco (volta ao primeiro no fim).
  function scrollTo(what: BoardTarget) {
    const root = document.getElementById(boardId);
    let el: HTMLElement | null | undefined;
    if (what === 'review') {
      const all = [...(root?.querySelectorAll<HTMLElement>('[data-review]') ?? [])];
      const at = all.findIndex((c) => c.contains(document.activeElement));
      el = view === 'timeline' && at === all.length - 1 && pendingGo.current !== what ? undefined : all[(at + 1) % Math.max(all.length, 1)];
    } else {
      el = root?.querySelector<HTMLElement>(what === 'alert' ? '[data-alert]' : `[data-chip="${what}"]`);
    }
    if (!el && view === 'timeline' && pendingGo.current !== what) {
      const next = [1, 2, 3, 4, 5, 6, 7].map((i) => (dayAt + i) % days.length).find((i) => days[i] && dayHas(days[i], what));
      if (next !== undefined) {
        pendingGo.current = what;
        if (next === dayAt) scrollTo(what);
        else setDayAt(next);
      }
      return;
    }
    pendingGo.current = null;
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    (el.querySelector<HTMLElement>('button') ?? el).focus({ preventScroll: true });
  }
  useEffect(() => {
    const what = pendingGo.current;
    if (what) scrollTo(what);
    // Só quando o dia mostrado muda por causa do placar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAt]);

  const state: BoardState = {
    counts,
    onlyReview,
    toggleReview: () => setOnlyReview((on) => !on),
    toConfirm: readOnly ? 0 : toConfirm,
    confirmAll,
    drafts: drafts.size,
    historyLoading,
  };
  const chipProps = {
    model,
    drafts,
    queued,
    keys,
    readOnly,
    pendingRows,
    lit,
    menu,
    setLit,
    setMenu,
    onPick: setPicking,
    onConfirm: (p: Pick) => confirm([p]),
    onDismiss: dismiss,
    onUnqueue: unqueue,
    onAccept: (a: AssignmentRow) => void acceptProposal(engine, a),
    onDiscard: (a: AssignmentRow) => void discardProposal(engine, a),
    onClear: (a: AssignmentRow) => void clearSlot(engine, a),
    onRemoveSlot: dropSlot,
    onAddRole: addRole,
    auto,
    asks,
    onAnswer: answer,
    reviews,
    onlyReview,
    colorOf,
  };
  const viewSwitch = (
    <span className="board-view-switch" role="group" aria-label="Visualização">
      {(['grid', 'timeline'] as const).map((v) => (
        <button key={v} type="button" className={view === v ? 'is-on' : undefined} aria-pressed={view === v} onClick={() => chooseView(v)}>
          {v === 'grid' ? 'Grade' : 'Linha do tempo'}
        </button>
      ))}
    </span>
  );
  return (
    <>
      {renderBar(state, scrollTo, viewSwitch)}
      {lit && litLoad && (
        <p className="board-lit" role="status">
          {model.personName(lit)}: {hoursText(litLoad.hours)} e {activitiesText(litLoad.count)} na semana
        </p>
      )}
      <TypeIconSprite types={cardTypes} />
      {view === 'timeline' && (
        <div className="board-views">
          <DayNav days={days} at={dayAt} today={today} onGo={setDayAt} />
        </div>
      )}
      <div id={boardId} className={`board${view === 'timeline' ? ' board--timeline' : ''}${lit ? ' is-lighting' : ''}`}>
        {(view === 'timeline' ? days.slice(dayAt, dayAt + 1) : days).map((day) => {
          const props = {
            day,
            today,
            rows: board,
            built,
            readOnly,
            dropped,
            onToggleOff: (t: TimeOff) => setDropped((s) => (s.has(t.key) ? new Set([...s].filter((k) => k !== t.key)) : new Set([...s, t.key]))),
            onOpenEvent,
            typeHints,
            sizeHints,
            chip: chipProps,
          };
          return view === 'timeline' ? <DayTimeline key={day.date} {...props} now={now} /> : <DayColumn key={day.date} {...props} />;
        })}
      </div>
      {viewedEvent && renderPanel?.(viewedEvent, <PanelCrew event={viewedEvent} rows={board} readOnly={readOnly} slots={model.slotsByEvent.get(viewedEvent.id) ?? []} chip={chipProps} />)}
      {pickSlot && pickEvent && (
        <PersonPicker
          ctx={ctx}
          slot={pickSlot}
          assignment={isPlanned(pickSlot.id) ? undefined : pickAssignment}
          people={model.rows.people}
          history={index}
          title={slotState(pickAssignment) === 'open' ? 'Escalar' : 'Trocar pessoa'}
          roleName={model.roleName(pickSlot.job_role_id)}
          eventTitle={pickEvent.title}
          onChoose={isPlanned(pickSlot.id) ? (personId, warnings, override) => confirm([{ slotId: pickSlot.id, personId, warnings, override }]) : undefined}
          onRemove={readOnly || pickEvent.status === 'cancelled' ? undefined : () => dropSlot(pickSlot.id)}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

type ChipProps = {
  model: ReturnType<typeof useSchedule>['model'];
  drafts: ReadonlyMap<string, Draft>;
  queued: ReadonlyMap<string, QueuedPick>;
  keys: ReadonlyMap<string, string>;
  readOnly: boolean;
  pendingRows: ReadonlySet<string>;
  lit: string | null;
  menu: string | null;
  setLit: (personId: string | null) => void;
  setMenu: (slotId: string | null) => void;
  onPick: (slotId: string) => void;
  onConfirm: (p: Pick) => void;
  onDismiss: (slotId: string) => void;
  onUnqueue: (slotId: string) => void;
  onAccept: (a: AssignmentRow) => void;
  onDiscard: (a: AssignmentRow) => void;
  onClear: (a: AssignmentRow) => void;
  onRemoveSlot: (slotId: string) => void;
  onAddRole: (e: EventRow, roleId: string) => void;
  /** Porte aplicado sozinho, que vai junto quando a montagem cria as vagas. */
  auto: ReadonlyMap<string, AutoSize>;
  /** Perguntas "virou o titular?" por evento. */
  asks: ReadonlyMap<string, TitularAsk[]>;
  onAnswer: (a: TitularAsk, yes: boolean) => void;
  /** Por que cada cartão precisa de olho; sem entrada, não precisa. */
  reviews: ReadonlyMap<string, string[]>;
  onlyReview: boolean;
  /** Cor do Google Agenda do cartão; nula fica a cor da família. */
  colorOf: (e: EventRow) => string | null;
};

function DayColumn({
  day,
  today,
  rows,
  built,
  readOnly,
  dropped,
  onToggleOff,
  onOpenEvent,
  typeHints,
  sizeHints,
  chip,
}: {
  day: BoardDay;
  today: string;
  rows: WeekRows;
  built: boolean;
  readOnly: boolean;
  dropped: ReadonlySet<string>;
  onToggleOff: (t: TimeOff) => void;
  onOpenEvent: (eventId: string) => void;
  typeHints: ReadonlyMap<string, ServiceTypeRow>;
  sizeHints: ReadonlyMap<string, SizeSuggestion>;
  chip: ChipProps;
}) {
  const empty = day.cards.length === 0;
  return (
    <section className={`board-day${empty ? ' is-empty' : ''}${day.date === today ? ' is-today' : ''}`} aria-label={day.label}>
      <header className="board-day-head">
        <h3 className="board-day-title">{empty ? day.short : day.label}</h3>
        {day.date === today && <Seal kind="hoje">hoje</Seal>}
      </header>
      {day.off.length > 0 && <OffStrip items={day.off} dropped={dropped} readOnly={readOnly} onToggle={onToggleOff} />}
      {empty ? (
        <p className="board-day-empty">sem atividades</p>
      ) : (
        <div className="board-day-body">
          {/* O mesmo cartão para tudo: o que não pede equipe só não tem as vagas. */}
          {day.cards.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              rows={rows}
              built={built}
              today={today}
              readOnly={readOnly}
              slots={chip.model.slotsByEvent.get(e.id) ?? []}
              onOpen={onOpenEvent}
              typeHint={typeHints.get(e.id)}
              sizeHint={sizeHints.get(e.id)}
              chip={chip}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export type BoardView = 'grid' | 'timeline';
const VIEW_KEY = 'semana.visao';

/** A visualização escolhida por último, neste navegador (sem acesso ao armazenamento, a grade). */
function readView(): BoardView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'timeline' ? 'timeline' : 'grid';
  } catch {
    return 'grid';
  }
}

function saveView(v: BoardView) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Sem armazenamento, a escolha vale só até recarregar.
  }
}

/** O dia que a linha do tempo abre: hoje, se for desta semana; senão o primeiro dia com atividade. */
function firstDay(days: readonly BoardDay[], today: string): number {
  const at = days.findIndex((d) => d.date === today);
  if (at >= 0) return at;
  return Math.max(0, days.findIndex((d) => d.cards.length > 0));
}

/** Setas e os sete dias da semana, com quantas atividades cada um tem. */
function DayNav({ days, at, today, onGo }: { days: readonly BoardDay[]; at: number; today: string; onGo: (i: number) => void }) {
  return (
    <nav className="board-daynav" aria-label="Dia da linha do tempo">
      <button type="button" className="board-daynav-step" disabled={at === 0} aria-label="Dia anterior" onClick={() => onGo(at - 1)}>
        ‹
      </button>
      {days.map((d, i) => {
        const n = d.cards.length;
        return (
          <button
            key={d.date}
            type="button"
            className={`board-daynav-day${i === at ? ' is-on' : ''}${d.date === today ? ' is-today' : ''}`}
            aria-current={i === at ? 'date' : undefined}
            aria-label={`${d.label}, ${n === 1 ? '1 atividade' : `${n} atividades`}`}
            onClick={() => onGo(i)}
          >
            {d.short}
            <span className="board-daynav-count">{n}</span>
          </button>
        );
      })}
      <button type="button" className="board-daynav-step" disabled={at === days.length - 1} aria-label="Próximo dia" onClick={() => onGo(at + 1)}>
        ›
      </button>
    </nav>
  );
}

/** Alturas de uma hora na linha do tempo, em pixels: o − e o + passam de uma para outra; 96 é a padrão. */
const HOUR_STEPS = [40, 56, 72, 96, 128, 160] as const;
const HOUR_PX = 96;
const ZOOM_KEY = 'semana.hora';

function readHourPx(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return (HOUR_STEPS as readonly number[]).includes(v) ? v : HOUR_PX;
  } catch {
    return HOUR_PX;
  }
}

function saveHourPx(v: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(v));
  } catch {
    // Sem armazenamento, a altura vale só até recarregar.
  }
}

/**
 * Um dia como no Google Agenda: as horas de cima para baixo, cada atividade na altura do horário e as que se cruzam
 * lado a lado. O cartão é o mesmo da grade; o que não couber na altura aparece ao passar o mouse ou entrar com o
 * teclado. Dia inteiro e as folgas ficam no topo.
 */
function DayTimeline({ now, ...props }: Parameters<typeof DayColumn>[0] & { now: Date }) {
  const { day, today, rows, built, readOnly, dropped, onToggleOff, onOpenEvent, chip } = props;
  // Todas as atividades no mesmo trilho, na ordem do horário; os cancelados ficam nas colunas da direita de cada grupo.
  const layout = useMemo(() => timelineLayout(day.date, day.cards), [day]);
  const [hourPx, setHourPx] = useState(readHourPx);
  const at = HOUR_STEPS.indexOf(hourPx as (typeof HOUR_STEPS)[number]);
  const zoom = (dir: -1 | 1) => {
    const next = HOUR_STEPS[at + dir];
    if (next === undefined) return;
    setHourPx(next);
    saveHourPx(next);
  };
  const hours = [];
  for (let m = layout.from; m < layout.to; m += 60) hours.push(m);
  const y = (min: number) => ((min - layout.from) / 60) * hourPx;
  const midnight = zonedTime(day.date, '00:00').getTime();
  const nowMin = day.date === today ? Math.round((now.getTime() - midnight) / 60_000) : null;
  return (
    <section className={`board-timeline${day.date === today ? ' is-today' : ''}`} aria-label={day.label}>
      <header className="board-day-head">
        <h3 className="board-day-title">{day.label}</h3>
        {day.date === today && <Seal kind="hoje">hoje</Seal>}
        <span className="board-zoom" role="group" aria-label="Altura das horas">
          <button type="button" aria-label="Diminuir a altura" disabled={at <= 0} onClick={() => zoom(-1)}>
            −
          </button>
          <button type="button" aria-label="Aumentar a altura" disabled={at >= HOUR_STEPS.length - 1} onClick={() => zoom(1)}>
            +
          </button>
        </span>
      </header>
      {day.off.length > 0 && <OffStrip items={day.off} dropped={dropped} readOnly={readOnly} onToggle={onToggleOff} />}
      {layout.allDay.length > 0 && (
        <div className="board-timeline-allday" aria-label="Dia inteiro">
          {layout.allDay.map((e) => (
            <AllDayBar key={e.id} event={e} slots={chip.model.slotsByEvent.get(e.id) ?? []} chip={chip} onOpen={onOpenEvent} />
          ))}
        </div>
      )}
      {layout.items.length === 0 && layout.allDay.length === 0 && <p className="board-day-empty">sem atividades</p>}
      <div className="board-timeline-grid" style={{ height: y(layout.to) }}>
        {hours.map((m) => (
          <span key={m} className="board-timeline-hour" style={{ top: y(m) }}>
            {`${String(m / 60).padStart(2, '0')}h`}
          </span>
        ))}
        {nowMin !== null && nowMin >= layout.from && nowMin <= layout.to && <span className="board-timeline-now" style={{ top: y(nowMin) }} aria-hidden="true" />}
        {layout.items.length > 0 && (
          <div className="board-timeline-track">
            {layout.items.map((it) => (
              // O dia cabe na largura da tela; o cartão estreito abre por cima ao passar o mouse, crescendo para dentro
              // do dia (os da metade direita crescem para a esquerda).
              <div
                key={it.event.id}
                className="board-timeline-item"
                style={
                  {
                    top: y(it.start),
                    ...((it.lane >= it.lanes / 2 && it.lanes > 1
                      ? { right: `calc(${((it.lanes - it.lane - 1) / it.lanes) * 100}% + 2px)` }
                      : { left: `calc(${(it.lane / it.lanes) * 100}% + 2px)` }) as CSSProperties),
                    width: `calc(${100 / it.lanes}% - 4px)`,
                    '--h': `${Math.max(((it.end - it.start) / 60) * hourPx - 4, 22)}px`,
                  } as CSSProperties
                }
              >
                <TimelineCard event={it.event} rows={rows} built={built} slots={chip.model.slotsByEvent.get(it.event.id) ?? []} chip={chip} onOpen={onOpenEvent} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Dia inteiro na linha do tempo, como no Google Agenda: uma barra fina com a cor e o título, e quantas vagas faltam.
 * Clicar abre o painel da direita, onde as vagas se escolhem e se mudam.
 */
function AllDayBar({ event, slots, chip, onOpen }: { event: EventRow; slots: readonly SlotRow[]; chip: ChipProps; onOpen: (eventId: string) => void }) {
  const color = chip.colorOf(event);
  const open = slots.filter((s) => chipState(chip.model.bySlot.get(s.id), chip.drafts.get(s.id)) === 'open').length;
  const title = shortTitle(event.title);
  const vagas = slots.length === 0 ? '' : open > 0 ? `${open} ${open === 1 ? 'vaga aberta' : 'vagas abertas'}` : `${slots.length} ${slots.length === 1 ? 'vaga' : 'vagas'}`;
  return (
    <button
      type="button"
      className={`board-allday${event.status === 'cancelled' ? ' is-cancelled' : ''}${open > 0 ? ' has-open' : ''}`}
      style={color ? ({ '--kind-color': color } as CSSProperties) : undefined}
      data-color={color ?? undefined}
      aria-label={`${title}, dia inteiro${vagas ? `, ${vagas}` : ''}`}
      title={`${title}${vagas ? ` · ${vagas}` : ''}`}
      onClick={() => onOpen(event.id)}
    >
      <span className="board-allday-title">{title}</span>
      {vagas && <span className="board-allday-slots">{vagas}</span>}
    </button>
  );
}

/**
 * Cartão da linha do tempo, como no Google Agenda: título, hora e quantas vagas faltam. As fichas ficam no painel
 * da direita, que abre no clique: lado a lado, num horário cheio, elas viravam "C.. v..".
 */
function TimelineCard({ event, rows, built, slots, chip, onOpen }: { event: EventRow; rows: WeekRows; built: boolean; slots: readonly SlotRow[]; chip: ChipProps; onOpen: (eventId: string) => void }) {
  const type = rows.types.find((t) => t.id === event.service_type_id);
  const color = chip.colorOf(event);
  const title = shortTitle(event.title);
  const cancelled = event.status === 'cancelled';
  const states = slots.map((s) => chipState(chip.model.bySlot.get(s.id), chip.drafts.get(s.id)));
  const open = states.filter((s) => s === 'open').length;
  const suggested = states.filter((s) => s === 'suggested').length;
  const alerts = eventAlerts(event, slots.length, built, rows.types);
  const review = chip.reviews.get(event.id);
  const status = cancelled
    ? 'cancelado'
    : !needsTeam(event, rows.types)
      ? (type?.name ?? '')
      : !type
        ? 'tipo a definir'
        : slots.length === 0
          ? 'sem vagas'
          : open > 0
            ? `${open} de ${slots.length} ${slots.length === 1 ? 'vaga aberta' : 'abertas'}`
            : suggested > 0
              ? `${suggested} a confirmar`
              : `${slots.length} ${slots.length === 1 ? 'vaga preenchida' : 'preenchidas'}`;
  const worst = open > 0 ? 'open' : suggested > 0 ? 'suggested' : states.length > 0 ? 'confirmed' : undefined;
  return (
    <button
      type="button"
      className={`board-tl-card board-kind--${activityKind(event, rows.types)}${color ? ' has-google-color' : ''}${isReserved(event, rows.types) ? ' is-reserved' : ''}${cancelled ? ' is-cancelled' : ''}${open > 0 ? ' has-open' : ''}${chip.onlyReview && !review ? ' is-dim' : ''}`}
      style={color ? ({ '--kind-color': color } as CSSProperties) : undefined}
      data-review={review ? '' : undefined}
      data-alert={alerts.length > 0 ? '' : undefined}
      data-chip={worst}
      aria-label={`${title}, ${eventSpan(event)}${status ? `, ${status}` : ''}`}
      title={[title, eventSpan(event), status, ...alerts].filter(Boolean).join(' · ')}
      onClick={() => onOpen(event.id)}
    >
      <span className="board-tl-title">
        {event.highlighted && <span className="mask-icon mask-icon--sm mask-star-on" aria-hidden="true" />}
        {title}
      </span>
      <span className="board-tl-meta">
        {eventSpan(event).split(' às ')[0]}
        {status && ` · ${status}`}
        {alerts.length > 0 && !cancelled && <span className="board-tl-alert"> !</span>}
      </span>
    </button>
  );
}

/** "Fora: Ana (férias), Caio (folga)". A folga da agenda se desmarca com um clique (não vale para a sugestão). */
function OffStrip({ items, dropped, readOnly, onToggle }: { items: TimeOff[]; dropped: ReadonlySet<string>; readOnly: boolean; onToggle: (t: TimeOff) => void }) {
  return (
    <p className="board-off" aria-label="Fora no dia">
      <span className="board-off-label">Fora:</span>
      {items.map((t) => {
        const off = dropped.has(t.key);
        const text = `${t.personId ? t.name : shortTitle(t.name)} (${TIME_OFF[t.kind].label.toLowerCase()})`;
        const toggles = Boolean(t.agendaTitle && t.personId) && !readOnly;
        return toggles ? (
          <button
            key={t.key}
            type="button"
            className={`board-off-item${off ? ' is-dropped' : ''}`}
            aria-pressed={!off}
            title={off ? 'Não vale: pode ser sugerido. Clique para voltar a valer.' : 'Pela agenda. Clique se a folga não vale.'}
            onClick={() => onToggle(t)}
          >
            {text}
          </button>
        ) : (
          <span key={t.key} className="board-off-item" title={t.agendaTitle ? 'Pela agenda, sem pessoa reconhecida' : 'Ausência cadastrada'}>
            {text}
          </span>
        );
      })}
    </p>
  );
}

function EventCard({
  event,
  rows,
  built,
  today,
  readOnly,
  slots,
  onOpen,
  typeHint,
  sizeHint,
  chip,
}: {
  event: EventRow;
  rows: WeekRows;
  built: boolean;
  today: string;
  readOnly: boolean;
  slots: readonly SlotRow[];
  onOpen: (eventId: string) => void;
  typeHint?: ServiceTypeRow;
  sizeHint?: SizeSuggestion;
  chip: ChipProps;
}) {
  const engine = useSyncEngine();
  const type = rows.types.find((t) => t.id === event.service_type_id);
  const sized = sizedType(event, rows.types);
  const kind = activityKind(event, rows.types);
  const alerts = eventAlerts(event, slots.length, built, rows.types);
  const title = shortTitle(event.title);
  const cancelled = event.status === 'cancelled';
  const canAdd = !readOnly && !cancelled && Boolean(event.service_type_id) && needsTeam(event, rows.types);
  const review = chip.reviews.get(event.id);
  const color = chip.colorOf(event);
  return (
    <article
      className={`board-card board-kind--${kind}${color ? ' has-google-color' : ''}${isReserved(event, rows.types) ? ' is-reserved' : ''}${event.highlighted ? ' is-highlighted' : ''}${cancelled ? ' board-card--cancelled' : ''}${chip.onlyReview && !review ? ' is-dim' : ''}`}
      style={color ? ({ '--kind-color': color } as CSSProperties) : undefined}
      data-color={color ?? undefined}
      aria-label={title}
      data-review={review ? '' : undefined}
      onClick={(ev) => {
        if (!(ev.target as HTMLElement).closest('button, a, input, select')) onOpen(event.id);
      }}
    >
      <header className="board-card-head">
        <span className="board-card-icon" aria-hidden="true">
          <svg width={18} height={18}>
            <use href={`#${iconId(type)}`} />
          </svg>
        </span>
        <span className="board-card-type">
          {type ? type.name : 'Tipo a definir'}
          {sized && ` · ${SIZE_LABEL[sizeFor(sized, event.size)]}`}
          {crewOrigin(event) && (
            <span className="board-card-origin" title={crewOrigin(event) === 'series' ? 'Vagas como a série aprendeu nas últimas semanas' : 'Porte pelas últimas vezes da série no histórico'}>
              {' '}
              · pela série
            </span>
          )}
        </span>
        {alerts.length > 0 && (
          <span className="board-alert" data-alert title={alerts.join('; ')} role="img" aria-label={`Avisos: ${alerts.join('; ')}`}>
            <AppIcon icon={DangerTriangleIcon} size={16} />
          </span>
        )}
        {/* A estrela se marca no painel do evento; aqui só aparece quando está marcada. */}
        {event.highlighted && <span className="mask-icon mask-icon--sm mask-star-on" role="img" aria-label="Atividade principal" />}
      </header>
      <button type="button" className="board-card-title title-button" onClick={() => onOpen(event.id)}>
        {title}
      </button>
      <span className="board-card-meta">
        {eventSpan(event)}
        {event.location ? ` · ${event.location}` : ''}
      </span>
      {/* Sem o "hoje": a coluna do dia já diz. */}
      {hasSeals(event) && (
        <span className="list-row-tags">
          <EventSeals event={event} today={today} noToday />
        </span>
      )}
      {!readOnly && !cancelled && (typeHint || (sizeHint && sized)) && (
        <span className="board-card-hints">
          {typeHint && !event.service_type_id && (
            <button type="button" className="text-button" onClick={() => void changeType(engine, event, typeHint.id, rows.types)} aria-label={`Usar ${typeHint.name} em ${title}`}>
              Usar {typeHint.name}
            </button>
          )}
          {sizeHint && sized && (
            <button
              type="button"
              className="text-button"
              onClick={() => void changeSize(engine, event, sizeHint.size as EventSize)}
              aria-label={`Usar porte ${SIZE_LABEL[sizeHint.size]} em ${title}`}
              title={`${sizeHint.people === 1 ? '1 pessoa' : `${sizeHint.people} pessoas`} nas últimas vezes`}
            >
              Sugerido: {SIZE_LABEL[sizeHint.size]}
            </button>
          )}
        </span>
      )}
      {chip.onlyReview && review && <span className="board-review-why">Para revisar: {review.join(', ')}</span>}
      {(chip.asks.get(event.id) ?? []).map((a) => {
        const name = chip.model.personName(a.personId);
        const role = chip.model.roleName(a.roleId);
        return (
          <p key={a.roleId} className="board-ask" role="group" aria-label={`${name} virou titular de ${role}?`}>
            <span>
              {name} fez {role} nas duas últimas vezes{a.current ? `, no lugar de ${chip.model.personName(a.current)}` : ''}. Virou o titular?
            </span>
            <button type="button" className="text-button" onClick={() => chip.onAnswer(a, true)}>
              Sim
            </button>
            <button type="button" className="text-button" onClick={() => chip.onAnswer(a, false)}>
              Não
            </button>
          </p>
        );
      })}
      {slots.length > 0 ? (
        <ul className="plain-list board-chips" aria-label={`Vagas de ${title}`}>
          {slots.map((s) => (
            <Chip key={s.id} slot={s} event={event} {...chip} />
          ))}
          {canAdd && <AddSlot event={event} rows={rows} slots={slots} onAdd={chip.onAddRole} />}
        </ul>
      ) : (
        needsTeam(event, rows.types) && (
          <>
            <span className="board-card-meta">
              {!event.service_type_id ? 'Escolha o tipo para ver as vagas.' : 'Sem vagas.'}{' '}
              {built && event.service_type_id && !readOnly && (
                <Button size="sm" variant="ghost" onClick={() => void buildWeek(engine, rows.weekStart, chip.auto)}>
                  Criar as vagas
                </Button>
              )}
            </span>
            {canAdd && (
              <ul className="plain-list board-chips" aria-label={`Vagas de ${title}`}>
                <AddSlot event={event} rows={rows} slots={slots} onAdd={chip.onAddRole} />
              </ul>
            )}
          </>
        )
      )}
    </article>
  );
}

/**
 * As vagas do evento no painel da direita, com as mesmas fichas da grade: escolher ou trocar a pessoa, confirmar,
 * tirar a vaga (lixeira) e pôr mais uma ("+ vaga"). A ficha no painel e a do cartão são a mesma vaga.
 */
function PanelCrew({ event, rows, readOnly, slots, chip }: { event: EventRow; rows: WeekRows; readOnly: boolean; slots: readonly SlotRow[]; chip: ChipProps }) {
  const title = shortTitle(event.title);
  const canAdd = !readOnly && event.status !== 'cancelled' && Boolean(event.service_type_id) && needsTeam(event, rows.types);
  if (slots.length === 0 && !canAdd) {
    return <span>{!event.service_type_id ? 'Escolha o tipo para ver as vagas.' : needsTeam(event, rows.types) ? 'Sem vagas.' : 'Este tipo não pede equipe.'}</span>;
  }
  return (
    <ul className="plain-list board-chips event-panel-crew" aria-label={`Vagas de ${title} no painel`}>
      {slots.map((s) => (
        <Chip key={s.id} slot={s} event={event} {...chip} />
      ))}
      {canAdd && <AddSlot event={event} rows={rows} slots={slots} onAdd={chip.onAddRole} />}
    </ul>
  );
}

/** "+ vaga": a lista de funções para pôr mais uma vaga no evento (as que o evento já tem primeiro). */
function AddSlot({ event, rows, slots, onAdd }: { event: EventRow; rows: WeekRows; slots: readonly SlotRow[]; onAdd: (e: EventRow, roleId: string) => void }) {
  const [open, setOpen] = useState(false);
  const title = shortTitle(event.title);
  const has = new Set(slots.map((s) => s.job_role_id));
  const roles = rows.roles
    .filter((r) => !r.archived_at)
    .sort((a, b) => Number(has.has(b.id)) - Number(has.has(a.id)) || a.name.localeCompare(b.name, 'pt-BR'));
  return (
    <li className="board-chip board-chip--add">
      <button type="button" className="board-chip-add" aria-haspopup="menu" aria-expanded={open} aria-label={`Pôr mais uma vaga em ${title}`} title="Pôr mais uma vaga (vale para as próximas semanas da série)" onClick={() => setOpen((o) => !o)}>
        + vaga
      </button>
      {open && (
        <ChipMenu onClose={() => setOpen(false)} label={`Função da vaga a mais em ${title}`}>
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitem"
              className="board-menu-item"
              onClick={() => {
                setOpen(false);
                onAdd(event, r.id);
              }}
            >
              {r.name}
            </button>
          ))}
        </ChipMenu>
      )}
    </li>
  );
}

const iconId = (type: ServiceTypeRow | undefined) => `board-type-${type?.id ?? 'none'}`;

/**
 * O ícone de cada tipo desenhado uma vez só, como símbolo, e reaproveitado pelos cartões com <use>: um ícone por
 * cartão, numa semana de 100 eventos ou mais, deixava a grade lenta para abrir.
 */
function TypeIconSprite({ types }: { types: readonly (ServiceTypeRow | undefined)[] }) {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      {types.map((t) => {
        const Icon = typeIcon(t).icon;
        return (
          <symbol key={iconId(t)} id={iconId(t)} viewBox="0 0 24 24">
            <Icon size={24} />
          </symbol>
        );
      })}
    </svg>
  );
}

/** O evento tem algum selo (interna, mudou...)? Sem selo, o cartão não leva a linha vazia. */
function hasSeals(e: EventRow): boolean {
  return (
    e.origin === 'internal' ||
    e.status === 'changed' ||
    e.status === 'cancelled' ||
    Boolean(e.restored || e.duplicate_group || e.review_pending)
  );
}

function Chip({ slot, event, model, drafts, queued, keys, readOnly, pendingRows, lit, menu, setLit, setMenu, onPick, onConfirm, onDismiss, onUnqueue, onAccept, onDiscard, onClear, onRemoveSlot }: ChipProps & { slot: SlotRow; event: EventRow }) {
  const a = model.bySlot.get(slot.id);
  const q = queued.get(keys.get(slot.id) ?? '');
  const draft = drafts.get(slot.id);
  const state: ChipState = q ? 'confirmed' : chipState(a, draft);
  const proposal = !q && slotState(a) === 'proposed';
  const personId = q?.personId ?? (slotState(a) !== 'open' ? (a?.person_id ?? null) : (draft?.personId ?? null));
  const role = model.roleName(slot.job_role_id);
  const who = personId ? model.personName(personId) : 'vaga aberta';
  const warnings = (slotState(a) === 'open' && draft ? (draft.warnings ?? []) : (a?.warnings ?? [])).filter((w) => w !== 'role_archived');
  const cancelled = event.status === 'cancelled';
  const sending = Boolean(q) || Boolean(a && pendingRows.has(`assignments:${a.id}`));
  const reason = draft?.reason ?? (proposal ? a?.reason : null);
  const disabled = readOnly || (cancelled && state !== 'confirmed') || (state === 'confirmed' && Boolean(a?.locked));
  const hint = [
    `${role}: ${who}`,
    draft ? `Sugestão: ${reason}` : proposal ? `Proposta${reason ? `: ${reason}` : ''}` : null,
    warnings.length > 0 ? `Alerta: ${warnings.map((w) => WARNING_LABEL[w] ?? w).join(', ')}` : null,
    state === 'open' && model.noApt.has(slot.id) ? 'Ninguém apto (função, horário, ausência ou limite de horas)' : null,
    a?.locked ? 'Travada' : null,
  ]
    .filter(Boolean)
    .join('. ');
  const open = menu === slot.id;
  const close = () => setMenu(null);
  const item = (label: string, act: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="board-menu-item"
      onClick={() => {
        close();
        act();
      }}
    >
      {label}
    </button>
  );
  return (
    <li
      className={`board-chip is-${state}${personId && personId === lit ? ' is-lit' : ''}`}
      data-chip={state}
      onMouseEnter={() => personId && setLit(personId)}
      onMouseLeave={() => setLit(null)}
    >
      <button
        type="button"
        className="board-chip-main"
        disabled={disabled}
        title={hint}
        aria-label={`${role}: ${who}${state === 'suggested' ? (draft ? ' (sugestão)' : ' (proposta)') : ''}`}
        aria-haspopup={state === 'open' ? 'dialog' : 'menu'}
        aria-expanded={state === 'open' ? undefined : open}
        onFocus={() => personId && setLit(personId)}
        onBlur={() => setLit(null)}
        onClick={() => (state === 'open' ? onPick(slot.id) : setMenu(open ? null : slot.id))}
      >
        {/* Só texto e marcas de CSS na ficha: centenas de ícones em SVG deixavam a grade lenta para abrir. */}
        <span className="board-chip-role">{role}</span>
        <span className="board-chip-name">{personId ? who : 'vaga aberta'}</span>
        {(warnings.length > 0 || a?.locked || sending) && (
          <span className="board-chip-flags">
            {warnings.length > 0 && <span className="board-chip-flag is-warning">alerta</span>}
            {a?.locked && <span className="board-chip-flag">travada</span>}
            {sending && <span className="board-chip-flag">a enviar</span>}
          </span>
        )}
      </button>
      {/* Lixeira à vista na vaga aberta (e no foco ou mouse nas outras): trabalho que pede menos gente perde a vaga em vez de ficar em falta. */}
      {!readOnly && !cancelled && (
        <button type="button" className="board-chip-drop" title="Tirar esta vaga" aria-label={`Tirar a vaga de ${role} (${who})`} onClick={() => onRemoveSlot(slot.id)} />
      )}
      {open && (
        <ChipMenu onClose={close} label={`${role}: ${who}`}>
          {state === 'suggested' && personId && item('Confirmar', () => (proposal && a ? onAccept(a) : draft && onConfirm(draftPick(slot.id, draft))))}
          {item('Trocar pessoa', () => onPick(slot.id))}
          {state === 'suggested' && item('Deixar vaga', () => (proposal && a ? onDiscard(a) : onDismiss(slot.id)))}
          {state === 'confirmed' && item('Desfazer', () => (q ? onUnqueue(slot.id) : a && onClear(a)))}
          {!cancelled && item('Tirar esta vaga', () => onRemoveSlot(slot.id))}
        </ChipMenu>
      )}
    </li>
  );
}

/** Menu curto da ficha; fecha no Esc e no clique fora. */
function ChipMenu({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="board-menu" role="menu" aria-label={label}>
      {children}
    </div>
  );
}

/** Placar e ações da escala, na barra da semana. */
export function BoardScore({ counts, onGo }: { counts: BoardCounts; onGo: (what: BoardTarget) => void }) {
  // Só o que tem: "0 sugestões" é ruído.
  const item = (what: BoardTarget, n: number, one: string, many: string) =>
    n > 0 && (
      <button type="button" className={`board-score-item is-${what}`} onClick={() => onGo(what)}>
        <strong>{n}</strong> {n === 1 ? one : many}
      </button>
    );
  return (
    <span className="board-score" aria-label="Placar da semana">
      {item('confirmed', counts.confirmed, 'confirmada', 'confirmadas')}
      {item('suggested', counts.suggested, 'sugestão', 'sugestões')}
      {item('open', counts.open, 'aberta', 'abertas')}
      {item('alert', counts.alerts, 'aviso', 'avisos')}
    </span>
  );
}

/** "Precisa de olho (n)": o filtro com quantos cartões; ligado, o "Próximo" pula de um em um. */
export function BoardReview({ state, onGo }: { state: BoardState; onGo: (what: BoardTarget) => void }) {
  const n = state.counts.review ?? 0;
  return (
    <span className="board-review" role="group" aria-label="Revisão">
      <button
        type="button"
        className={`board-review-toggle${state.onlyReview ? ' is-on' : ''}`}
        aria-pressed={state.onlyReview}
        title="Apaga os cartões que já estão resolvidos"
        onClick={state.toggleReview}
      >
        Precisa de olho <strong>{n}</strong>
      </button>
      {state.onlyReview && (
        <button type="button" className="text-button" disabled={n === 0} onClick={() => onGo('review')}>
          Próximo
        </button>
      )}
    </span>
  );
}
