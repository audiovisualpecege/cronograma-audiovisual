import { addDays, zonedTime, type ProposalBatch } from '@cronograma/core';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JobFailure } from '../queue.ts';
import type { ProposalData } from '../store.ts';
import { FakeStore } from '../test/fakeStore.ts';
import { GeminiFake, chooseFirstFree, fakeClock } from '../test/mocks.ts';
import { silentLogger } from '../log.ts';
import { GeminiProvider } from './gemini.ts';
import { BATCH_SIZE, NOTE_NO_FIT, NOTE_NO_PROPOSAL, ProposalRunner } from './proposal.ts';
import { AiError, CallSpacer, paced, type AiProvider, type ProposalAnswer } from './provider.ts';

const WEEK = '2026-10-26';
const R1 = 'role-r1';
const R5 = 'role-r5';
const T1 = 'type-t1';

const at = (day: number, hour: number) => zonedTime(addDays(WEEK, day), `${String(hour).padStart(2, '0')}:00`).toISOString();

type Person = ProposalData['people'][number];
const person = (n: number, roles: string[] = [R1], active = true): Person => ({
  id: `p${n}`, code: `P${n}`, active, weekly_limit_hours: 44, role_ids: roles,
});

/** Semana B com um evento de 1 h por vaga de R1, em horários que não se cruzam. */
function week(slots: number, extra: Partial<ProposalData> = {}): ProposalData {
  const events: ProposalData['events'] = [];
  const s: ProposalData['slots'] = [];
  const a: ProposalData['assignments'] = [];
  for (let i = 0; i < slots; i++) {
    const day = Math.floor(i / 18);
    const hour = 6 + (i % 18);
    events.push({
      id: `e${i + 1}`, week_start: WEEK, starts_at: at(day, hour), ends_at: at(day, hour + 1), all_day: false,
      period_start: null, period_end: null, status: 'active', service_type_id: T1, no_team: false, ignored: false,
    });
    s.push({ id: `s${String(i + 1).padStart(3, '0')}`, event_id: `e${i + 1}`, job_role_id: R1 });
    a.push({ slot_id: `s${String(i + 1).padStart(3, '0')}`, event_id: `e${i + 1}`, person_id: null, status: null, locked: false });
  }
  return {
    week: { id: 'week-b', week_start: WEEK, state: 'building' },
    people: [person(3), person(4), person(5)],
    events, slots: s, assignments: a, absences: [],
    jobRoles: [{ id: R1, code: 'R1' }, { id: R5, code: 'R5' }],
    serviceTypes: [{ id: T1, code: 'T1', no_team: false }],
    history: [{ person_id: 'p5', job_role_id: R1, service_type_id: T1 }],
    ...extra,
  };
}

/** Provedor falso que escolhe com a mesma regra do simulador do Gemini. */
const firstCandidate = (batch: ProposalBatch): ProposalAnswer => chooseFirstFree(batch.slots, batch.people);

function fakeProvider(answer: (b: ProposalBatch, call: number) => ProposalAnswer | Promise<ProposalAnswer>) {
  const calls: ProposalBatch[] = [];
  const provider: AiProvider = {
    id: 'gemini',
    testKey: async () => ({ ok: true }),
    classify: async () => [],
    propose: async (b) => {
      calls.push(structuredClone(b));
      return answer(b, calls.length);
    },
  };
  return { provider, calls };
}

function runner(data: ProposalData, provider: AiProvider, clock = fakeClock()) {
  const store = new FakeStore();
  store.proposal = data;
  return { store, run: new ProposalRunner(store, async () => provider, clock, silentLogger()) };
}

const progress = async () => {};

const gemini = new GeminiFake();
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe('ProposalRunner', () => {
  it('UT-133 descarta pessoa inexistente, inativa, ausente, sem a função e em sobreposição', async () => {
    const data = week(5);
    data.people = [person(3), person(6, [R1], false), person(7, [R5]), person(8), person(9)];
    data.absences = [{ person_id: 'p8', starts_at: at(0, 8), ends_at: at(0, 9) }];
    // P9 já confirmado noutro evento no mesmo horário da vaga V5.
    data.events.push({ ...(data.events[4] as ProposalData['events'][number]), id: 'e-x' });
    data.slots.push({ id: 's999', event_id: 'e-x', job_role_id: R1 });
    data.assignments.push({ slot_id: 's999', event_id: 'e-x', person_id: 'p9', status: 'confirmed', locked: false });
    const picks: Record<string, string> = { V1: 'P99', V2: 'P6', V3: 'P8', V4: 'P7', V5: 'P9' };
    const { provider } = fakeProvider((b) => b.slots.map((s) => ({ slot: s.slot, person: picks[s.slot] ?? null, reason: 'teste' })));
    const { store, run } = runner(data, provider);
    const res = await run.run('job-1', { week_id: 'week-b' }, progress);
    expect(store.writes.flat()).toEqual(
      ['s001', 's002', 's003', 's004', 's005'].map((slot_id) => ({ slot_id, person_id: null, reason: NOTE_NO_FIT })),
    );
    expect(res).toMatchObject({ proposed: 0, discarded: 5 });
  });

  it('UT-134 lote 1 ok e lote 2 com quota grava o lote 1 e marca o lote 2 sem proposta', async () => {
    const { provider } = fakeProvider((b, call) => {
      if (call === 2) throw new AiError('quota', 'limite');
      return firstCandidate(b);
    });
    // Lotes de 25 (BATCH_SIZE): 26 vagas dão 2 lotes.
    const { store, run } = runner(week(BATCH_SIZE + 1), provider);
    const res = await run.run('job-1', { week_id: 'week-b' }, progress);
    expect(store.writes).toHaveLength(2);
    expect(store.writes[0]).toHaveLength(BATCH_SIZE);
    expect(store.writes[0]?.every((w) => w.person_id !== null)).toBe(true);
    expect(store.writes[1]).toEqual([{ slot_id: 's026', person_id: null, reason: NOTE_NO_PROPOSAL, keep_person: true }]);
    expect(res).toMatchObject({ batches_total: 2, batches_done: 1, proposed: BATCH_SIZE, without_proposal: 1, partial: true, ai_quota_hits: 1, error_detail: 'limite' });
    expect(store.notices).toEqual([expect.objectContaining({ kind: 'ai_failed', title: 'IA sem resposta' })]);
  });

  it('IA sem resposta no primeiro lote: o job falha e nada é gravado', async () => {
    const { provider } = fakeProvider(() => {
      throw new AiError('unavailable', 'fora do ar');
    });
    const { store, run } = runner(week(3), provider);
    const err = await run.run('job-1', { week_id: 'week-b' }, progress).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobFailure);
    expect((err as Error).message).toBe('A IA não respondeu agora; monte à mão ou tente mais tarde.');
    expect(store.writes).toEqual([]);
    expect(store.notices).toHaveLength(1);
  });

  it('UT-135 vagas confirmadas ou travadas não entram nos lotes e não são alteradas', async () => {
    const data = week(4);
    const set = (i: number, patch: Partial<ProposalData['assignments'][number]>) => Object.assign(data.assignments[i] as object, patch);
    set(0, { person_id: 'p3', status: 'confirmed' });
    set(1, { person_id: 'p4', status: 'proposed', locked: true });
    set(2, { locked: true });
    const { provider, calls } = fakeProvider(firstCandidate);
    const { store, run } = runner(data, provider);
    await run.run('job-1', { week_id: 'week-b' }, progress);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.slots.map((s) => s.slot)).toEqual(['V4']);
    expect(store.writes.flat().map((w) => w.slot_id)).toEqual(['s004']);
  });

  it('UT-136 sem histórico o resultado traz noHistory=true', async () => {
    const { provider } = fakeProvider(firstCandidate);
    const { run } = runner(week(2, { history: [] }), provider);
    expect(await run.run('job-1', { week_id: 'week-b' }, progress)).toMatchObject({ noHistory: true, proposed: 2 });
    const { run: withHistory } = runner(week(2), fakeProvider(firstCandidate).provider);
    expect(await withHistory.run('job-2', { week_id: 'week-b' }, progress)).toMatchObject({ noHistory: false });
  });

  it('UT-137 três chamadas seguidas ficam com pelo menos 12 s entre si', async () => {
    const clock = fakeClock();
    const times: number[] = [];
    const { provider } = fakeProvider((b) => {
      times.push(clock.now().getTime());
      return firstCandidate(b);
    });
    // Três lotes: 2 cheios e mais 1 vaga.
    const { run } = runner(week(2 * BATCH_SIZE + 1), paced(provider, new CallSpacer(clock)), clock);
    const res = await run.run('job-1', { week_id: 'week-b' }, progress);
    expect(times).toHaveLength(3);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(12_000);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(12_000);
    expect(res).toMatchObject({ batches_total: 3, batches_done: 3, ai_calls: 3 });
  });

  it('UT-166 um AiProvider falso com o mesmo formato grava o mesmo que o GeminiProvider simulado', async () => {
    gemini.requests = [];
    server.use(...gemini.handlers());
    const data = week(8);
    data.people.push(person(6), person(7));
    const viaGemini = runner(data, new GeminiProvider({ key: 'AIzaSy-chave', model: 'gemini-2.5-flash', clock: fakeClock() }));
    const viaFake = runner(data, fakeProvider(firstCandidate).provider);
    const a = await viaGemini.run.run('job-1', { week_id: 'week-b' }, progress);
    const b = await viaFake.run.run('job-2', { week_id: 'week-b' }, progress);
    expect(gemini.requests).toHaveLength(1);
    expect(viaGemini.store.writes.flat().map(({ slot_id, person_id }) => [slot_id, person_id]))
      .toEqual(viaFake.store.writes.flat().map(({ slot_id, person_id }) => [slot_id, person_id]));
    expect(a).toEqual(b);
  });

  it('o pedido à IA leva só códigos, nunca nome nem e-mail', async () => {
    const data = week(2);
    const { provider, calls } = fakeProvider(firstCandidate);
    await runner(data, provider).run.run('job-1', { week_id: 'week-b' }, progress);
    const sent = JSON.stringify(calls);
    expect(sent).not.toMatch(/p[0-9]+"|role-|type-|@/);
    expect(sent).toContain('"P3"');
  });

  it('IA desligada ou sem chave: o job falha com o motivo', async () => {
    const off = runner(week(1), fakeProvider(firstCandidate).provider);
    off.store.settingsRow.ai_proposal_enabled = false;
    await expect(off.run.run('j', { week_id: 'week-b' }, progress)).rejects.toThrow('A pré-escala pela IA está desligada; monte a escala à mão.');
    const store = new FakeStore();
    store.proposal = week(1);
    const noKey = new ProposalRunner(store, async () => null, fakeClock(), silentLogger());
    await expect(noKey.run('j', { week_id: 'week-b' }, progress)).rejects.toThrow('Configure a chave da IA antes de pedir a proposta.');
  });
});
