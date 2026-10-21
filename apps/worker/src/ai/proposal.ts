// Pré-escala (ADR-012): o core calcula os aptos de cada vaga, a IA escolhe entre eles em lotes de até 25 vagas,
// e cada escolha é conferida de novo por checkEligibility antes de virar assignments.status='proposed'.
// Vaga confirmada ou travada nunca entra; a proposta só vale depois de um administrador aceitar (ADR-001).
import {
  buildHistoryIndex,
  buildProposalBatches,
  checkEligibility,
  isWeekPast,
  openSlots,
  type AssignmentLike,
  type WeekContext,
} from '@cronograma/core';
import type { Clock } from '../clock.ts';
import { errorMessage, type Logger } from '../log.ts';
import { JobFailure, type JobResult } from '../queue.ts';
import type { ProposalData, ProposalStore, ProposalWrite } from '../store.ts';
import { AiError, type AiProvider } from './provider.ts';

/**
 * Vagas por chamada. Eram 60; com semanas de centenas de vagas, a resposta grande vinha torta com frequência, e
 * um modelo pequeno (MiniCPM5) acompanha melhor lotes menores.
 */
export const BATCH_SIZE = 25;

/** O motivo da falha da IA, curto, para guardar no pedido e mostrar na tela. */
const detail = (e: AiError) => e.message.slice(0, 300);
export const NOTE_NO_FIT = 'a IA não achou alguém apto';
export const NOTE_NO_PROPOSAL = 'sem proposta';
export const AI_SILENT = 'A IA não respondeu agora; monte à mão ou tente mais tarde.';

/** Contexto da semana para as regras do core, com códigos V.. para as vagas em ordem cronológica. */
export function weekContext(data: ProposalData, now: Date, replacePending: boolean): WeekContext {
  const typeNoTeam = new Map(data.serviceTypes.map((t) => [t.id, t.no_team]));
  const events = data.events
    .filter((e) => !e.ignored)
    .map((e) => ({
      id: e.id,
      weekStart: e.week_start,
      startsAt: new Date(e.starts_at),
      endsAt: new Date(e.ends_at),
      allDay: e.all_day,
      periodStart: e.period_start ? new Date(e.period_start) : null,
      periodEnd: e.period_end ? new Date(e.period_end) : null,
      status: e.status,
      serviceTypeId: e.service_type_id,
      noTeam: e.no_team || (e.service_type_id ? (typeNoTeam.get(e.service_type_id) ?? false) : false),
    }));
  const start = new Map(events.map((e) => [e.id, e.startsAt.getTime()]));
  const slots = data.slots
    .filter((s) => start.has(s.event_id))
    .sort((a, b) => (start.get(a.event_id) as number) - (start.get(b.event_id) as number) || a.id.localeCompare(b.id))
    .map((s, i) => ({ id: s.id, code: `V${i + 1}`, eventId: s.event_id, jobRoleId: s.job_role_id }));
  const assignments: AssignmentLike[] = data.assignments
    .filter((a) => a.person_id && a.status)
    .map((a) => ({
      slotId: a.slot_id,
      eventId: a.event_id,
      personId: a.person_id as string,
      // Sem substituir, a proposta pendente fica como está: conta na carga e a vaga não entra nos lotes.
      status: !replacePending && a.status === 'proposed' ? 'confirmed' : (a.status as 'proposed' | 'confirmed'),
      locked: a.locked,
    }));
  // Vaga travada sem pessoa também fica fora da proposta (US-015 AC-4).
  for (const a of data.assignments) {
    if (!a.person_id && a.locked) assignments.push({ slotId: a.slot_id, eventId: a.event_id, personId: '', status: 'proposed', locked: true });
  }
  return {
    weekStart: data.week.week_start,
    now,
    people: data.people.map((p) => ({ id: p.id, code: p.code, active: p.active, weeklyLimitHours: p.weekly_limit_hours, roleIds: p.role_ids })),
    events,
    slots,
    assignments,
    absences: data.absences.map((a) => ({ personId: a.person_id, startsAt: new Date(a.starts_at), endsAt: new Date(a.ends_at) })),
    jobRoles: data.jobRoles,
    serviceTypes: data.serviceTypes,
  };
}

export class ProposalRunner {
  constructor(
    private store: ProposalStore,
    private providerFor: () => Promise<AiProvider | null>,
    private clock: Pick<Clock, 'now'>,
    private log: Logger,
  ) {}

  async run(jobId: string, payload: Record<string, unknown>, progress: (r: JobResult) => Promise<void>): Promise<JobResult> {
    const settings = await this.store.settings();
    if (!settings.ai_proposal_enabled) throw new JobFailure('A pré-escala pela IA está desligada; monte a escala à mão.');
    const weekId = String(payload.week_id ?? '');
    const data = await this.store.proposalData(weekId);
    const now = this.clock.now();
    if (isWeekPast(data.week.week_start, now)) throw new JobFailure('Semana passada fica só para consulta.');
    const provider = await this.providerFor();
    if (!provider) throw new JobFailure('Configure a chave da IA antes de pedir a proposta.');

    const ctx = weekContext(data, now, payload.replace_pending !== false);
    const history = buildHistoryIndex(
      data.history.map((h) => ({ personId: h.person_id, jobRoleId: h.job_role_id, serviceTypeId: h.service_type_id })),
    );
    const personByCode = new Map(ctx.people.map((p) => [p.code, p.id]));
    const slotByCode = new Map(ctx.slots.map((s) => [s.code, s]));
    const initialOpen = new Set(openSlots(ctx).map((s) => s.id));
    // Base da validação: tudo o que não vai ser substituído, mais as escolhas já aceitas nesta rodada.
    const work: WeekContext = { ...ctx, assignments: ctx.assignments.filter((a) => !initialOpen.has(a.slotId)) };
    const picks: { slotId: string; personId: string }[] = [];
    const skipped = new Set<string>();

    const result: JobResult = {
      week_id: weekId,
      batches_total: buildProposalBatches(ctx, history, { batchSize: BATCH_SIZE }).length,
      batches_done: 0,
      slots_open: initialOpen.size,
      proposed: 0,
      discarded: 0,
      without_proposal: 0,
      noHistory: data.history.length === 0,
      ai_calls: 0,
      ai_quota_hits: 0,
    };
    await progress({ ...result });

    for (let index = 0; ; index++) {
      const view: WeekContext = { ...ctx, slots: ctx.slots.filter((s) => !skipped.has(s.id)) };
      const pending = buildProposalBatches(view, history, { batchSize: BATCH_SIZE, prior: picks });
      const batch = pending[0];
      if (!batch) break;
      batch.index = index;

      let answer;
      try {
        (result.ai_calls as number)++;
        answer = await provider.propose(batch);
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        if (e.kind === 'quota') (result.ai_quota_hits as number)++;
        this.log.warn({ job_id: jobId, error: errorMessage(e), batch: index }, 'IA sem resposta na pré-escala');
        await this.store.notifyAdmins({
          kind: 'ai_failed',
          title: 'IA sem resposta',
          body: index === 0 ? AI_SILENT : 'A IA parou no meio da proposta; o que chegou ficou guardado e as outras vagas estão sem proposta.',
          link: '#/painel',
          dedupe: `ai_failed:${jobId}`,
        });
        // Nada chegou: nada muda (US-013 EC-2). Parte chegou: fica guardada e o resto fica "sem proposta" (EC-9).
        if (index === 0) throw new JobFailure(AI_SILENT, { ...result, error_kind: e.kind, error_detail: detail(e) });
        const rest = pending.flatMap((b) => b.slots).map((s) => (slotByCode.get(s.slot) as { id: string }).id);
        await this.store.writeProposals(rest.map((id) => ({ slot_id: id, person_id: null, reason: NOTE_NO_PROPOSAL, keep_person: true })));
        result.without_proposal = rest.length;
        result.without_proposal_slots = rest;
        result.partial = true;
        result.error_kind = e.kind;
        result.error_detail = detail(e);
        break;
      }

      const writes: ProposalWrite[] = [];
      for (const s of batch.slots) {
        const slot = slotByCode.get(s.slot) as { id: string; eventId: string };
        const suggestion = answer.find((a) => a.slot === s.slot);
        const personId = suggestion?.person ? personByCode.get(suggestion.person) : undefined;
        const ok = personId !== undefined && checkEligibility(personId, slot.id, work).ok;
        if (ok && suggestion) {
          work.assignments.push({ slotId: slot.id, eventId: slot.eventId, personId, status: 'proposed', locked: false });
          picks.push({ slotId: slot.id, personId });
          writes.push({ slot_id: slot.id, person_id: personId, reason: suggestion.reason.trim().slice(0, 200) || 'proposta da IA' });
          (result.proposed as number)++;
        } else {
          skipped.add(slot.id);
          writes.push({ slot_id: slot.id, person_id: null, reason: NOTE_NO_FIT });
          (result.discarded as number)++;
        }
      }
      await this.store.writeProposals(writes);
      result.batches_done = index + 1;
      await progress({ ...result });
    }
    return result;
  }
}
