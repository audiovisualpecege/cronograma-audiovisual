// Pré-escala, classificação e chave da IA com o worker real e o Gemini simulado.
import { describe, expect, it, vi } from 'vitest';
import { GeminiFake, firstCandidateAnswer, geminiText } from '../../../apps/worker/src/test/mocks.ts';
import { EVENT, SLOT, WEEK_A, type } from '../helpers/ids.ts';
import {
  applyOne, as, assignmentOf, buildWeekB, one, op, rpc, slotOf, sql, useSeed,
} from '../helpers/supabase.ts';
import { AI_KEY, gemini, job, notificationsOf, runJob, setAiKey, useWorker } from './harness.ts';

const geminiAnswer = (answer: unknown) => geminiText(JSON.stringify(answer));

const proposedOf = (weekStart: string) =>
  sql<{ slot_id: string; person_id: string; status: string; reason: string }>(
    `select a.slot_id, a.person_id, a.status, a.reason from public.assignments a join public.events e on e.id = a.event_id
     where e.week_start = $1 and a.status = 'proposed' order by a.slot_id`,
    [weekStart],
  );

async function propose(worker: Parameters<typeof runJob>[0], weekId: string, replace = true) {
  const { job_id } = await rpc<{ job_id: string }>(as('P1'), 'request_job', { kind: 'propose', payload: { week_id: weekId, replace_pending: replace } });
  await worker.queue.drain();
  return { id: job_id, ...(await job(job_id)) };
}

describe('pré-escala e chave da IA', () => {
  useSeed();
  const ctx = useWorker();

  it('IT-073 propose grava propostas com justificativa, invisíveis para a Equipe; o segundo pedido troca só as pendentes', async () => {
    await setAiKey();
    const { weekId } = await buildWeekB();
    const first = await propose(ctx.worker, weekId);
    expect(first.status).toBe('done');
    const proposals = await proposedOf('2026-10-26');
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.every((p) => p.reason === 'primeiro apto da lista')).toBe(true);
    const { data: seen } = await as('P10').from('assignments').select('id').eq('status', 'proposed');
    expect(seen).toEqual([]);

    // Aceita a proposta da Câmera do B1 e pede de novo substituindo as pendentes.
    const b1 = await slotOf(EVENT.B1, 'R1');
    const accepted = await assignmentOf(b1);
    expect((await applyOne(as('P1'), op('assignment.accept', { slot_id: b1 }))).status).toBe('applied');
    gemini.fallback = (req) => {
      const payload = JSON.parse(req.body.contents[0]?.parts[0]?.text ?? '{}') as { slots: { slot: string; candidates: { person: string }[] }[] };
      // Desta vez escolhe o último apto de cada vaga, para a troca aparecer.
      return { body: geminiAnswer(payload.slots.map((s) => ({ slot: s.slot, person: s.candidates.at(-1)?.person ?? null, reason: 'segunda proposta' }))) };
    };
    try {
      const second = await propose(ctx.worker, weekId);
      expect(second.status).toBe('done');
    } finally {
      gemini.fallback = firstCandidateAnswer;
    }
    expect(await assignmentOf(b1)).toMatchObject({ person_id: accepted.person_id, status: 'confirmed' });
    const after = await proposedOf('2026-10-26');
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((p) => p.reason === 'segunda proposta' && p.slot_id !== b1)).toBe(true);
  });

  it('IT-074 reabrir a semana depois da proposta não cria job nem chama o Gemini', async () => {
    await setAiKey();
    const { weekId } = await buildWeekB();
    await propose(ctx.worker, weekId);
    const calls = gemini.requests.length;
    const jobs = (await sql('select id from public.jobs')).length;
    const { data } = await as('P1').from('assignments').select('id, status').eq('status', 'proposed');
    expect(data?.length).toBeGreaterThan(0);
    await ctx.worker.queue.drain();
    expect(gemini.requests.length).toBe(calls);
    expect((await sql('select id from public.jobs')).length).toBe(jobs);
  });

  it('IT-075 Gemini 503: job failed, nada muda e os administradores recebem "IA sem resposta"', async () => {
    await setAiKey();
    const { weekId } = await buildWeekB();
    const before = await sql('select slot_id, person_id, status, reason from public.assignments order by slot_id');
    gemini.queue.push(GeminiFake.error('503'));
    const res = await propose(ctx.worker, weekId);
    expect(res).toMatchObject({ status: 'failed', error: 'A IA não respondeu agora; monte à mão ou tente mais tarde.' });
    expect(await sql('select slot_id, person_id, status, reason from public.assignments order by slot_id')).toEqual(before);
    for (const admin of [1, 2]) {
      expect(await notificationsOf(admin, 'ai_failed')).toEqual([expect.objectContaining({ title: 'IA sem resposta' })]);
    }
  });

  it('IT-076 o corpo enviado ao Gemini não traz nenhum nome nem e-mail da semente', async () => {
    await setAiKey();
    const { weekId } = await buildWeekB();
    await propose(ctx.worker, weekId);
    await runJob(ctx.worker, 'calendar_sync'); // classificação do "Live de lançamento" também vai à IA
    expect(gemini.requests.length).toBeGreaterThanOrEqual(2);
    const people = await sql<{ name: string; email: string }>('select name, email from public.people');
    for (const req of gemini.requests) {
      for (const p of people) {
        expect(req.raw).not.toContain(p.name);
        expect(req.raw).not.toContain(p.email);
      }
      expect(req.raw).not.toMatch(/exemplo\.test|Pessoa Exemplo/);
    }
  });

  it('IT-077 semana com 210 vagas gera 4 chamadas e grava o progresso a cada lote', async () => {
    await setAiKey();
    // 102 atividades internas de Gravação de aula (2 vagas cada) somam 204 vagas às 6 da semente.
    await sql(
      `insert into public.events (origin, title, starts_at, ends_at, service_type_id)
       select 'internal', 'Aula extra ' || i,
              timestamptz '2026-10-26 06:00-03' + ((i % 7) || ' days')::interval + ((i / 7) || ' hours')::interval,
              timestamptz '2026-10-26 07:00-03' + ((i % 7) || ' days')::interval + ((i / 7) || ' hours')::interval,
              $1
       from generate_series(0, 101) i`,
      [type(1)],
    );
    const { weekId } = await buildWeekB();
    expect(Number((await one<{ n: string }>(
      "select count(*) n from public.slots s join public.events e on e.id = s.event_id where e.week_start = '2026-10-26' and s.archived_at is null",
    )).n)).toBe(210);
    const progress = vi.spyOn(ctx.store, 'saveJobResult');
    const res = await propose(ctx.worker, weekId);
    expect(res.status).toBe('done');
    expect(gemini.requests).toHaveLength(4);
    expect(progress.mock.calls.map(([, r]) => r.batches_done)).toEqual([0, 1, 2, 3, 4]);
    expect(res.result).toMatchObject({ batches_total: 4, batches_done: 4, slots_open: 210, ai_calls: 4 });
  });

  it('IT-033 assignment.lock grava locked e o ProposalRunner seguinte não toca a vaga', async () => {
    await setAiKey();
    const { weekId } = await buildWeekB();
    const b1 = await slotOf(EVENT.B1, 'R1');
    expect((await applyOne(as('P1'), op('assignment.lock', { slot_id: b1, locked: true }))).status).toBe('applied');
    const locked = await assignmentOf(b1);
    expect(locked.locked).toBe(true);
    await propose(ctx.worker, weekId);
    expect(await assignmentOf(b1)).toMatchObject({ person_id: null, status: null, locked: true, version: locked.version });
    const sent = gemini.requests.map((r) => r.raw).join('');
    expect(sent).not.toContain(b1);
  });

  it('IT-100 propose numa semana publicada só preenche vagas abertas; aceitar marca dirty_since', async () => {
    await setAiKey();
    expect((await applyOne(as('P1'), op('assignment.clear', { slot_id: SLOT.E1_R5 }))).status).toBe('applied');
    await sql('update public.weeks set dirty_since = null where id = $1', [WEEK_A.id]);
    const before = await sql('select slot_id, person_id, status from public.assignments where slot_id <> $1 order by slot_id', [SLOT.E1_R5]);
    const res = await propose(ctx.worker, WEEK_A.id);
    expect(res.result).toMatchObject({ slots_open: 1, proposed: 1 });
    expect(await sql('select slot_id, person_id, status from public.assignments where slot_id <> $1 order by slot_id', [SLOT.E1_R5])).toEqual(before);
    const proposed = await assignmentOf(SLOT.E1_R5);
    expect(proposed.status).toBe('proposed');
    expect((await one<{ dirty_since: Date | null }>('select dirty_since from public.weeks where id = $1', [WEEK_A.id])).dirty_since).toBeNull();
    expect((await applyOne(as('P1'), op('assignment.accept', { slot_id: SLOT.E1_R5 }))).status).toBe('applied');
    expect((await one<{ dirty_since: Date | null }>('select dirty_since from public.weeks where id = $1', [WEEK_A.id])).dirty_since).not.toBeNull();
  });

  it('IT-084 chave inválida (Gemini 400) mantém a anterior e o job termina com "Chave recusada pelo fornecedor"', async () => {
    await setAiKey('AIzaSyANTERIOR-chave-boa-9999');
    await sql("update public.settings set ai_key_hint = '...9999'");
    gemini.model = GeminiFake.error('400-invalid-key');
    try {
      await rpc(as('P1'), 'set_ai_key', { provider: 'gemini', key: 'AIzaSyERRADA-chave-1234' });
      const { id } = await one<{ id: string }>("select id from public.jobs where kind = 'test_ai_key'");
      await ctx.worker.queue.drain();
      expect(await job(id)).toMatchObject({ status: 'failed', error: 'Chave recusada pelo fornecedor' });
      expect(gemini.modelRequests.at(-1)?.key).toBe('AIzaSyERRADA-chave-1234');
      expect(await rpc(ctx.store.db, 'get_secret', { p_name: 'ai_key' })).toBe('AIzaSyANTERIOR-chave-boa-9999');
      expect(await rpc(ctx.store.db, 'get_secret', { p_name: 'ai_key_pending' })).toBeNull();
      expect((await one<{ ai_key_hint: string }>('select ai_key_hint from public.settings')).ai_key_hint).toBe('...9999');

      // Chave boa: só depois do teste ela vira a chave em uso.
      gemini.model = { body: { name: 'models/gemini-2.5-flash' } };
      await rpc(as('P1'), 'set_ai_key', { provider: 'gemini', key: AI_KEY });
      await ctx.worker.queue.drain();
      expect(await rpc(ctx.store.db, 'get_secret', { p_name: 'ai_key' })).toBe(AI_KEY);
      expect((await one<{ ai_key_hint: string }>('select ai_key_hint from public.settings')).ai_key_hint).toBe('...0000');
    } finally {
      gemini.model = { body: { name: 'models/gemini-2.5-flash' } };
    }
  });

  it('job classify classifica os eventos sem tipo e mantém o que o administrador escolheu', async () => {
    await runJob(ctx.worker, 'calendar_sync');
    await setAiKey();
    gemini.queue.push({ body: geminiAnswer([{ id: 'E1', type: 'T3', certainty: 'media' }, { id: 'E2', type: 'T3', certainty: 'media' }]) });
    const res = await runJob(ctx.worker, 'classify');
    expect(res.status).toBe('done');
    expect(await one('select service_type_id, type_source from public.events where id = $1', [EVENT.B5])).toEqual({ service_type_id: type(3), type_source: 'ai' });
    expect(await one('select service_type_id, type_source from public.events where id = $1', [EVENT.E2])).toEqual({ service_type_id: type(2), type_source: 'admin' });
  });
});
