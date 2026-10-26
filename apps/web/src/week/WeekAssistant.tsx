import { CheckCircleIcon, DangerCircleIcon, MagicWandIcon } from '@solar-icons/react/bold-duotone';
import { useMemo, useState } from 'react';
import { SIZE_LABEL } from '@cronograma/core';
import { sizeFor, type AssignmentRow, type EventRow, type HistoryFactRow, type SlotRow } from '../data/catalog';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { AppIcon } from '../ui/AppIcon';
import { Button } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { typeIcon } from '../ui/typeIcons';
import { activityKind, assistantDays, dayValidation, KIND_LABEL, shortTitle, timeOffAbsences, type ActivityKind, type AssistantDay } from './assistant';
import { proposeByHistory, type Draft } from './historyProposal';
import { eventSpan, isMeetingEvent, publishSummary, slotState, weekTimeOff, type TimeOff, type WeekRows } from './model';
import { PersonPicker } from './PersonPicker';
import { roleIcon } from './roleIcon';
import { useSchedule } from './ScheduleEditor';
import { TIME_OFF } from './timeOffIcons';
import { acceptProposal, buildWeek, setPerson, useBuildPending } from './useWeek';

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

interface AssistantProps {
  rows: WeekRows;
  now: Date;
  today: string;
  historyRows: readonly HistoryFactRow[] | null;
  /** O histórico ainda está chegando: as sugestões esperam por ele. */
  historyLoading: boolean;
  onClose: () => void;
  onPublish: () => void;
}

/** Botão do Assistente, com a varinha. */
export function AssistantButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick}>
      <AppIcon icon={MagicWandIcon} size={18} /> Assistente
    </Button>
  );
}

/**
 * Assistente da semana: uma janela em passos. Primeiro as folgas e férias (para confirmar quem está fora), depois
 * cada dia com as atividades separadas por cor e ícone e as vagas com a pessoa, a sugestão ou o aviso de vaga
 * aberta. "Validar e seguir" confirma o dia; no fim, o resumo e o Publicar.
 */
export function WeekAssistant({ rows, now, today, historyRows, historyLoading, onClose, onPublish }: AssistantProps) {
  const timeOff = useMemo(() => weekTimeOff(rows), [rows]);
  const days = useMemo(() => assistantDays(rows), [rows]);
  // 0 = folgas e férias; 1..n = os dias; n + 1 = resumo.
  const [step, setStep] = useState(0);
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set(timeOff.map((t) => t.key)));
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Draft> | null>(null);

  const last = days.length + 1;
  const title = step === 0 ? 'Folga e férias' : step === last ? 'Semana revisada' : (days[step - 1]?.label ?? '');
  return (
    <Dialog open onClose={onClose} title="Assistente" width={820}>
      <div className="wiz">
        <Stepper
          days={days}
          step={step}
          done={done}
          onGo={(i) => {
            // Os dias só abrem depois das folgas: é lá que nascem as sugestões.
            if (i === 0 || drafts) setStep(i);
          }}
        />
        <h3 className="wiz-title">{title}</h3>
        {!rows.week ? (
          <BuildFirst rows={rows} />
        ) : step === 0 ? (
          <TimeOffStep
            items={timeOff}
            kept={kept}
            onToggle={(key) => setKept((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])))}
            waiting={historyLoading}
            onNext={(suggest) => {
              setDrafts(suggest);
              setStep(days.length > 0 ? 1 : last);
            }}
            rows={rows}
            now={now}
            today={today}
            historyRows={historyRows}
          />
        ) : step === last ? (
          <SummaryStep rows={rows} onPublish={onPublish} onClose={onClose} onBack={() => setStep(step - 1)} />
        ) : (
          <DayStep
            key={step}
            rows={rows}
            now={now}
            today={today}
            historyRows={historyRows}
            kept={kept}
            timeOff={timeOff}
            day={days[step - 1] as AssistantDay}
            drafts={drafts ?? new Map()}
            onDiscard={(slotId) => setDrafts((d) => new Map([...(d ?? [])].filter(([id]) => id !== slotId)))}
            lastDay={step === days.length}
            onBack={() => setStep(step - 1)}
            onValidated={(date) => {
              setDone((s) => new Set([...s, date]));
              setStep(step + 1);
            }}
          />
        )}
      </div>
    </Dialog>
  );
}

/** Folgas, os dias e o resumo, em bolinhas: o atual em destaque, os validados com o visto. */
function Stepper({ days, step, done, onGo }: { days: AssistantDay[]; step: number; done: ReadonlySet<string>; onGo: (i: number) => void }) {
  const items = [{ key: 'folgas', label: 'Folgas', ok: step > 0 }, ...days.map((d) => ({ key: d.date, label: d.short, ok: done.has(d.date) })), { key: 'fim', label: 'Fim', ok: false }];
  return (
    <ol className="wiz-steps" aria-label="Passos do assistente">
      {items.map((it, i) => (
        <li key={it.key}>
          <button
            type="button"
            className={`wiz-step${i === step ? ' is-current' : ''}${it.ok ? ' is-done' : ''}`}
            aria-current={i === step ? 'step' : undefined}
            onClick={() => onGo(i)}
          >
            {it.ok && <AppIcon icon={CheckCircleIcon} size={14} />}
            {it.label}
          </button>
        </li>
      ))}
    </ol>
  );
}

function BuildFirst({ rows }: { rows: WeekRows }) {
  const engine = useSyncEngine();
  const building = useBuildPending(rows.weekStart);
  return (
    <div className="wiz-empty">
      <p className="form-text">A semana ainda não foi montada: as vagas nascem na montagem, pela equipe de cada tipo.</p>
      <Button onClick={() => void buildWeek(engine, rows.weekStart)} disabled={building}>
        {building ? 'Montando a semana' : 'Montar a semana'}
      </Button>
    </div>
  );
}

const spanText = (t: TimeOff) => (t.from === t.to ? t.from.slice(8, 10) + '/' + t.from.slice(5, 7) : `${t.from.slice(8, 10)}/${t.from.slice(5, 7)} a ${t.to.slice(8, 10)}/${t.to.slice(5, 7)}`);

/** Passo 1: quem está fora na semana. Desmarcar tira a folga da agenda da conta (a cadastrada sempre vale). */
function TimeOffStep({
  items,
  kept,
  onToggle,
  waiting,
  onNext,
  rows,
  now,
  today,
  historyRows,
}: {
  items: TimeOff[];
  kept: ReadonlySet<string>;
  onToggle: (key: string) => void;
  waiting: boolean;
  onNext: (drafts: ReadonlyMap<string, Draft>) => void;
  rows: WeekRows;
  now: Date;
  today: string;
  historyRows: readonly HistoryFactRow[] | null;
}) {
  const schedule = useSchedule(rows, now, today, historyRows);
  function next() {
    const meetings = new Set(rows.events.filter((e) => isMeetingEvent(e, rows.types)).map((e) => e.id));
    const ctx = { ...schedule.ctx, absences: [...schedule.ctx.absences, ...timeOffAbsences(items, kept)] };
    onNext(schedule.readOnly ? new Map() : proposeByHistory(ctx, schedule.index, (id) => meetings.has(id)));
  }
  return (
    <>
      {items.length === 0 ? (
        <p className="form-text">Ninguém de folga ou férias nesta semana.</p>
      ) : (
        <>
          <p className="form-text">Confira quem está fora. Quem fica marcado não entra nas sugestões dos dias em que está fora.</p>
          <ul className="plain-list wiz-timeoff" aria-label="Folga e férias">
            {items.map((t) => {
              const fromAgenda = Boolean(t.agendaTitle);
              const on = !fromAgenda || kept.has(t.key);
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    className={`wiz-off wiz-off--${t.kind}${on ? '' : ' is-off'}`}
                    aria-pressed={on}
                    disabled={!fromAgenda || !t.personId}
                    onClick={() => onToggle(t.key)}
                    title={fromAgenda ? (t.personId ? 'Toque para confirmar ou não' : 'Pessoa não reconhecida pelo nome') : 'Ausência cadastrada'}
                  >
                    <span className="wiz-off-icon">
                      <AppIcon icon={TIME_OFF[t.kind].icon} size={20} />
                    </span>
                    <span className="wiz-off-text">
                      <strong>{t.name}</strong>
                      <span>
                        {TIME_OFF[t.kind].label}, {spanText(t)}
                        {fromAgenda ? (t.personId ? ' · agenda' : ' · agenda, sem pessoa') : ' · cadastrada'}
                      </span>
                    </span>
                    {on && t.personId && <AppIcon icon={CheckCircleIcon} size={20} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="wiz-actions">
        <span className="form-text">{waiting ? 'Lendo o histórico para sugerir as pessoas.' : ''}</span>
        <Button onClick={next} disabled={waiting}>
          Confirmar e seguir
        </Button>
      </div>
    </>
  );
}

const KIND_ORDER: ActivityKind[] = ['aula', 'producao', 'reuniao'];

/** Um dia: as atividades com cor e ícone da família e as vagas com quem vai, a sugestão ou o aviso. */
function DayStep({
  rows,
  now,
  today,
  historyRows,
  kept,
  timeOff,
  day,
  drafts,
  onDiscard,
  lastDay,
  onBack,
  onValidated,
}: {
  rows: WeekRows;
  now: Date;
  today: string;
  historyRows: readonly HistoryFactRow[] | null;
  kept: ReadonlySet<string>;
  timeOff: TimeOff[];
  day: AssistantDay;
  drafts: ReadonlyMap<string, Draft>;
  onDiscard: (slotId: string) => void;
  lastDay: boolean;
  onBack: () => void;
  onValidated: (date: string) => void;
}) {
  const engine = useSyncEngine();
  const { pendingRows } = useSyncState();
  const schedule = useSchedule(rows, now, today, historyRows);
  const { model, index, readOnly } = schedule;
  const ctx = useMemo(() => ({ ...schedule.ctx, absences: [...schedule.ctx.absences, ...timeOffAbsences(timeOff, kept)] }), [schedule.ctx, timeOff, kept]);
  const [picking, setPicking] = useState<string | null>(null);
  // Sugestão só vale enquanto a vaga segue aberta.
  const open = useMemo(() => new Map([...drafts].filter(([slotId]) => slotState(model.bySlot.get(slotId)) === 'open')), [drafts, model.bySlot]);
  const plan = dayValidation(day.events, model.slotsByEvent, model.bySlot, open);
  const kinds = KIND_ORDER.filter((k) => day.events.some((e) => activityKind(e, rows.types) === k));
  const pickSlot = picking ? model.rows.slots.find((s) => s.id === picking) : undefined;
  const pickAssignment = picking ? model.bySlot.get(picking) : undefined;
  const pickEvent = pickSlot ? rows.events.find((e) => e.id === pickSlot.event_id) : undefined;

  function validate() {
    for (const d of plan.drafts) void setPerson(engine, d.assignment, d.personId, [], false);
    for (const a of plan.proposals) void acceptProposal(engine, a);
    onValidated(day.date);
  }

  const toConfirm = plan.drafts.length + plan.proposals.length;
  return (
    <>
      {kinds.length > 1 && (
        <ul className="plain-list wiz-legend" aria-label="Cores">
          {kinds.map((k) => (
            <li key={k} className={`wiz-legend-item wiz-kind--${k}`}>
              {KIND_LABEL[k]}
            </li>
          ))}
        </ul>
      )}
      {day.events.length === 0 && <p className="form-text">Nenhuma atividade com equipe neste dia.</p>}
      <ul className="plain-list wiz-events" aria-label={`Atividades de ${day.label}`}>
        {day.events.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            rows={rows}
            slots={model.slotsByEvent.get(e.id) ?? []}
            roleName={model.roleName}
            personName={model.personName}
            bySlot={model.bySlot}
            drafts={open}
            pending={pendingRows}
            readOnly={readOnly}
            onPick={setPicking}
            onDiscard={onDiscard}
          />
        ))}
      </ul>
      {day.markers.length > 0 && (
        <p className="wiz-markers">
          <span className="wiz-markers-label">Sem equipe</span>
          {day.markers.map((m) => shortTitle(m.title)).join(' · ')}
        </p>
      )}
      <div className="wiz-actions">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <span className="wiz-plan" role="status">
          {toConfirm > 0 && <span className="wiz-plan-ok">{plural(toConfirm, 'pessoa a confirmar', 'pessoas a confirmar')}</span>}
          {plan.open > 0 && <span className="wiz-plan-open">{plural(plan.open, 'vaga aberta', 'vagas abertas')}</span>}
          {toConfirm === 0 && plan.open === 0 && <span className="wiz-plan-ok">tudo certo</span>}
        </span>
        <Button onClick={validate} disabled={readOnly}>
          {lastDay ? 'Validar e concluir' : 'Validar e seguir'}
        </Button>
      </div>
      {pickSlot && pickAssignment && pickEvent && (
        <PersonPicker
          ctx={ctx}
          slot={pickSlot}
          assignment={pickAssignment}
          people={model.rows.people}
          history={index}
          title={slotState(pickAssignment) === 'open' ? 'Escalar' : 'Trocar pessoa'}
          roleName={model.roleName(pickSlot.job_role_id)}
          eventTitle={pickEvent.title}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

function EventCard({
  event,
  rows,
  slots,
  roleName,
  personName,
  bySlot,
  drafts,
  pending,
  readOnly,
  onPick,
  onDiscard,
}: {
  event: EventRow;
  rows: WeekRows;
  slots: readonly SlotRow[];
  roleName: (id: string) => string;
  personName: (id: string | null | undefined) => string;
  bySlot: ReadonlyMap<string, AssignmentRow>;
  drafts: ReadonlyMap<string, Draft>;
  pending: ReadonlySet<string>;
  readOnly: boolean;
  onPick: (slotId: string) => void;
  onDiscard: (slotId: string) => void;
}) {
  const kind = activityKind(event, rows.types);
  const type = rows.types.find((t) => t.id === event.service_type_id);
  return (
    <li className={`wiz-event wiz-kind--${kind}${event.highlighted ? ' is-highlighted' : ''}`} aria-label={shortTitle(event.title)}>
      <span className="wiz-event-icon" aria-hidden="true">
        <AppIcon icon={typeIcon(type).icon} size={22} />
      </span>
      <span className="wiz-event-main">
        <span className="wiz-event-head">
          <strong className="wiz-event-title">{shortTitle(event.title)}</strong>
          <span className="wiz-event-meta">
            {eventSpan(event)}
            {type ? ` · ${type.name}` : ''}
            {type?.sized ? ` · ${SIZE_LABEL[sizeFor(type, event.size)]}` : ''}
          </span>
        </span>
        {slots.length === 0 ? (
          <span className="wiz-event-meta">Sem vagas</span>
        ) : (
          <span className="wiz-slots">
            {slots.map((s) => {
              const a = bySlot.get(s.id);
              const state = slotState(a);
              const draft = state === 'open' ? drafts.get(s.id) : undefined;
              const cls = state === 'confirmed' ? 'is-confirmed' : state === 'proposed' || draft ? 'is-suggested' : 'is-open';
              const who = state !== 'open' ? personName(a?.person_id) : draft ? personName(draft.personId) : 'vaga aberta';
              const role = roleName(s.job_role_id);
              return (
                <span key={s.id} className={`wiz-slot ${cls}`}>
                  <button
                    type="button"
                    className="wiz-slot-main"
                    disabled={readOnly || !a || event.status === 'cancelled'}
                    onClick={() => onPick(s.id)}
                    title={draft ? `Sugestão: ${draft.reason}. Toque para trocar.` : state === 'proposed' ? 'Proposta. Toque para trocar.' : 'Toque para escolher a pessoa'}
                    aria-label={`${role}: ${who}`}
                  >
                    <AppIcon icon={roleIcon(role)} size={16} />
                    <span className="wiz-slot-name">{who}</span>
                    {state === 'confirmed' && <AppIcon icon={CheckCircleIcon} size={16} />}
                    {cls === 'is-open' && <AppIcon icon={DangerCircleIcon} size={16} />}
                    {a && pending.has(`assignments:${a.id}`) && <span className="wiz-slot-pending">a enviar</span>}
                  </button>
                  {draft && !readOnly && (
                    <button type="button" className="wiz-slot-x" onClick={() => onDiscard(s.id)} aria-label={`Descartar a sugestão de ${role}`} title="Descartar a sugestão">
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </span>
        )}
      </span>
    </li>
  );
}

/** Fim: o que ficou confirmado e aberto na semana, e o Publicar. */
function SummaryStep({ rows, onPublish, onClose, onBack }: { rows: WeekRows; onPublish: () => void; onClose: () => void; onBack: () => void }) {
  const s = publishSummary(rows);
  return (
    <>
      <ul className="plain-list wiz-summary">
        <li className="wiz-summary-item is-confirmed">
          <strong>{s.filled}</strong> confirmadas
        </li>
        <li className="wiz-summary-item is-suggested">
          <strong>{s.proposed}</strong> propostas
        </li>
        <li className="wiz-summary-item is-open">
          <strong>{s.open}</strong> abertas
        </li>
      </ul>
      <p className="form-text">
        {rows.week?.state === 'published'
          ? 'A semana já está publicada: as mudanças aparecem como alterações não publicadas até você publicar de novo.'
          : 'A equipe só vê a escala depois de publicar.'}
      </p>
      <div className="wiz-actions">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <span />
        <span className="week-actions-buttons">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={onPublish}>Publicar</Button>
        </span>
      </div>
    </>
  );
}
