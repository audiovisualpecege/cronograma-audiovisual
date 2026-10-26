import { DangerTriangleIcon } from '@solar-icons/react/bold-duotone';
import { buildSeriesSizes, localDate, personLoad, SIZE_LABEL, weekStartOf, type EventSize, type SizeSuggestion, type WeekContext } from '@cronograma/core';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { sizeFor, toFact, type AssignmentRow, type EventRow, type HistoryFactRow, type ServiceTypeRow, type SlotRow } from '../data/catalog';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';
import { Button } from '../ui/chiaro';
import { typeIcon } from '../ui/typeIcons';
import {
  activityKind,
  boardCounts,
  boardDays,
  chipState,
  eventAlerts,
  isPlanned,
  plannedRows,
  shortTitle,
  slotKeys,
  timeOffAbsences,
  type BoardCounts,
  type BoardDay,
  type ChipState,
} from './board';
import { EventSeals } from './EventSeals';
import { proposeByHistory, type Draft } from './historyProposal';
import { activitiesText, eventSpan, hoursText, isMeetingEvent, needsTeam, sizedType, sizeSuggestions, slotState, WARNING_LABEL, weekTimeOff, type TimeOff, type WeekRows } from './model';
import { PersonPicker } from './PersonPicker';
import { changeSize, changeType } from './PreviewPage';
import { useSchedule } from './schedule';
import { Seal } from './Seal';
import { TIME_OFF } from './timeOffIcons';
import { buildTitleIndex, typeSuggestions } from './typeSuggestions';
import { acceptProposal, buildWeek, clearSlot, discardProposal, setPerson, useBuildPending } from './useWeek';

const NO_DRAFTS: ReadonlyMap<string, Draft> = new Map();

/** Escolha feita numa vaga prevista: gravada na vaga de verdade assim que a montagem a criar. */
interface QueuedPick {
  key: string;
  personId: string;
  warnings: string[];
  override: boolean;
}

interface Pick {
  slotId: string;
  personId: string;
  warnings?: string[];
  override?: boolean;
}

export interface BoardState {
  counts: BoardCounts;
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
  /** A barra do topo (placar e "Confirmar sugestões") fica na página; a grade passa o que ela mostra. */
  renderBar: (state: BoardState, scrollTo: (what: ChipState | 'alert') => void) => ReactNode;
}

/**
 * Grade da semana: uma coluna por dia com atividade, cada atividade num cartão com as vagas em fichas (verde
 * confirmada, tracejada sugestão ou proposta, vermelha aberta) e as folgas no topo do dia. Nas semanas futuras,
 * as vagas abertas já vêm com a sugestão do histórico; nada grava sem confirmar. Semana ainda sem montagem mostra
 * as vagas previstas e monta sozinha na primeira confirmação.
 */
export function WeekBoard({ rows, now, today, historyRows, historyLoading, onOpenEvent, renderBar }: BoardProps) {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const building = useBuildPending(rows.weekStart);
  const board = useMemo(() => plannedRows(rows), [rows]);
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
  const keys = useMemo(() => slotKeys(board.slots), [board.slots]);
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

  // Escolhas em vagas previstas, gravadas quando a montagem criar as vagas.
  const [queue, setQueue] = useState<QueuedPick[]>([]);
  const queued = useMemo(() => new Map(queue.map((q) => [q.key, q])), [queue]);
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
        if (slotState(a) === 'open') writes.push(setPerson(engine, a, q.personId, q.warnings, q.override));
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
    if (!rows.week && !building) void buildWeek(engine, rows.weekStart);
  }

  const dismiss = (slotId: string) => setDismissed((s) => new Set([...s, keys.get(slotId) ?? slotId]));
  const unqueue = (slotId: string) => setQueue((q) => q.filter((x) => x.key !== keys.get(slotId)));

  const counts = useMemo(() => boardCounts(model, drafts, built), [model, drafts, built]);
  const toConfirm = drafts.size + schedule.proposed.length;
  function confirmAll() {
    confirm([...drafts].map(([slotId, d]) => ({ slotId, personId: d.personId })));
    for (const a of schedule.proposed) void acceptProposal(engine, a);
  }

  // Tipo e porte sugeridos pelo histórico, no cartão.
  const titleIndex = useMemo(() => buildTitleIndex(historyRows), [historyRows]);
  const typeHints = useMemo(() => typeSuggestions(rows, titleIndex), [rows, titleIndex]);
  const seriesSizes = useMemo(() => buildSeriesSizes((historyRows ?? []).map(toFact)), [historyRows]);
  const sizeHints = useMemo(() => sizeSuggestions(rows, seriesSizes), [rows, seriesSizes]);

  // Passar o mouse numa ficha acende a mesma pessoa na semana toda.
  const [lit, setLit] = useState<string | null>(null);
  const litLoad = lit ? personLoad(lit, ctx) : null;

  const [menu, setMenu] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const pickSlot = picking ? board.slots.find((s) => s.id === picking) : undefined;
  const pickEvent = pickSlot ? board.events.find((e) => e.id === pickSlot.event_id) : undefined;
  const pickAssignment = picking ? model.bySlot.get(picking) : undefined;

  const boardId = useId();
  function scrollTo(what: ChipState | 'alert') {
    const el = document.getElementById(boardId)?.querySelector<HTMLElement>(what === 'alert' ? '[data-alert]' : `[data-chip="${what}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    (el.querySelector<HTMLElement>('button') ?? el).focus({ preventScroll: true });
  }

  const state: BoardState = { counts, toConfirm: readOnly ? 0 : toConfirm, confirmAll, drafts: drafts.size, historyLoading };
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
  };
  return (
    <>
      {renderBar(state, scrollTo)}
      {lit && litLoad && (
        <p className="board-lit" role="status">
          {model.personName(lit)}: {hoursText(litLoad.hours)} e {activitiesText(litLoad.count)} na semana
        </p>
      )}
      <TypeIconSprite types={cardTypes} />
      <div id={boardId} className={`board${lit ? ' is-lighting' : ''}`}>
        {days.map((day) => (
          <DayColumn
            key={day.date}
            day={day}
            today={today}
            rows={board}
            built={built}
            readOnly={readOnly}
            dropped={dropped}
            onToggleOff={(t) => setDropped((s) => (s.has(t.key) ? new Set([...s].filter((k) => k !== t.key)) : new Set([...s, t.key])))}
            onOpenEvent={onOpenEvent}
            typeHints={typeHints}
            sizeHints={sizeHints}
            chip={chipProps}
          />
        ))}
      </div>
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
  const empty = day.cards.length === 0 && day.lines.length === 0;
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
          {day.lines.map((e) => (
            <MarkerLine key={e.id} event={e} types={rows.types} onOpen={onOpenEvent} />
          ))}
        </div>
      )}
    </section>
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
  return (
    <article
      className={`board-card board-kind--${kind}${event.highlighted ? ' is-highlighted' : ''}${cancelled ? ' board-card--cancelled' : ''}`}
      aria-label={title}
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
      {hasSeals(event, today) && (
        <span className="list-row-tags">
          <EventSeals event={event} today={today} />
        </span>
      )}
      {!readOnly && !cancelled && (typeHint || (sizeHint && sized)) && (
        <span className="board-card-hints">
          {typeHint && !event.service_type_id && (
            <button type="button" className="text-button" onClick={() => void changeType(engine, event, typeHint.id)} aria-label={`Usar ${typeHint.name} em ${title}`}>
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
      {slots.length > 0 ? (
        <ul className="plain-list board-chips" aria-label={`Vagas de ${title}`}>
          {slots.map((s) => (
            <Chip key={s.id} slot={s} event={event} {...chip} />
          ))}
        </ul>
      ) : (
        needsTeam(event, rows.types) && (
          <span className="board-card-meta">
            {!event.service_type_id ? 'Escolha o tipo para ver as vagas.' : 'Sem vagas.'}{' '}
            {built && event.service_type_id && !readOnly && (
              <Button size="sm" variant="ghost" onClick={() => void buildWeek(engine, rows.weekStart)}>
                Criar as vagas
              </Button>
            )}
          </span>
        )
      )}
    </article>
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

/** O evento tem algum selo (hoje, interna, mudou...)? Sem selo, o cartão não leva a linha vazia. */
function hasSeals(e: EventRow, today: string): boolean {
  const first = localDate(new Date(e.starts_at));
  const last = localDate(new Date(Math.max(Date.parse(e.starts_at), Date.parse(e.ends_at) - 1)));
  return (
    (first <= today && today <= last) ||
    e.origin === 'internal' ||
    e.status === 'changed' ||
    e.status === 'cancelled' ||
    Boolean(e.restored || e.duplicate_group || e.review_pending)
  );
}

/** Reunião, folga, lembrete: uma linha fina e cinza, só para contexto. */
function MarkerLine({ event, types, onOpen }: { event: EventRow; types: readonly ServiceTypeRow[]; onOpen: (eventId: string) => void }) {
  const type = types.find((t) => t.id === event.service_type_id);
  return (
    <button type="button" className="board-line" onClick={() => onOpen(event.id)} aria-label={`${shortTitle(event.title)}, ${eventSpan(event)}`}>
      <AppIcon icon={typeIcon(type).icon} size={14} />
      <span className="board-line-time">{event.all_day ? 'dia todo' : eventSpan(event).split(' às ')[0]}</span>
      <span className="board-line-title">{shortTitle(event.title)}</span>
    </button>
  );
}

function Chip({ slot, event, model, drafts, queued, keys, readOnly, pendingRows, lit, menu, setLit, setMenu, onPick, onConfirm, onDismiss, onUnqueue, onAccept, onDiscard, onClear }: ChipProps & { slot: SlotRow; event: EventRow }) {
  const a = model.bySlot.get(slot.id);
  const q = queued.get(keys.get(slot.id) ?? '');
  const draft = drafts.get(slot.id);
  const state: ChipState = q ? 'confirmed' : chipState(a, draft);
  const proposal = !q && slotState(a) === 'proposed';
  const personId = q?.personId ?? (slotState(a) !== 'open' ? (a?.person_id ?? null) : (draft?.personId ?? null));
  const role = model.roleName(slot.job_role_id);
  const who = personId ? model.personName(personId) : 'vaga aberta';
  const warnings = (a?.warnings ?? []).filter((w) => w !== 'role_archived');
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
      {open && (
        <ChipMenu onClose={close} label={`${role}: ${who}`}>
          {state === 'suggested' && personId && item('Confirmar', () => (proposal && a ? onAccept(a) : onConfirm({ slotId: slot.id, personId })))}
          {item('Trocar pessoa', () => onPick(slot.id))}
          {state === 'suggested' && item('Deixar vaga', () => (proposal && a ? onDiscard(a) : onDismiss(slot.id)))}
          {state === 'confirmed' && item('Desfazer', () => (q ? onUnqueue(slot.id) : a && onClear(a)))}
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
export function BoardScore({ counts, onGo }: { counts: BoardCounts; onGo: (what: ChipState | 'alert') => void }) {
  const item = (what: ChipState | 'alert', n: number, one: string, many: string) => (
    <button type="button" className={`board-score-item is-${what}`} disabled={n === 0} onClick={() => onGo(what)}>
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
