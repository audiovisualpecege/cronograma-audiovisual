import type { ProposalBatch } from '@cronograma/core';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GeminiFake, fakeClock, fixture } from '../test/mocks.ts';
import { GeminiProvider } from './gemini.ts';
import { AiError } from './provider.ts';

const gemini = new GeminiFake();
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const batch: ProposalBatch = {
  index: 0,
  slots: [
    { slot: 'V1', role: 'R1', type: 'T1', start: '2026-10-26T09:00:00-03:00', end: '2026-10-26T12:00:00-03:00', hours: 3,
      candidates: [{ person: 'P5', hist: 4, loadHours: 3, loadCount: 1, inTieGroup: true }] },
    { slot: 'V2', role: 'R5', type: 'T1', start: '2026-10-26T09:00:00-03:00', end: '2026-10-26T12:00:00-03:00', hours: 3,
      candidates: [{ person: 'P17', hist: 0, loadHours: 0, loadCount: 0, inTieGroup: true }] },
  ],
  people: [
    { person: 'P5', loadHours: 3, loadCount: 1, limitHours: 44 },
    { person: 'P17', loadHours: 0, loadCount: 0, limitHours: 44 },
  ],
};

let clock: ReturnType<typeof fakeClock>;
let provider: GeminiProvider;

beforeEach(() => {
  gemini.requests = [];
  gemini.queue = [];
  server.use(...gemini.handlers());
  clock = fakeClock();
  provider = new GeminiProvider({ key: 'AIzaSy-chave-de-teste', model: 'gemini-2.5-flash', clock });
});

describe('GeminiProvider', () => {
  it('UT-128 propose com JSON válido devolve a lista { slot, person, reason }', async () => {
    gemini.queue.push({ body: fixture('gemini/propose.json') });
    expect(await provider.propose(batch)).toEqual([
      { slot: 'V1', person: 'P5', reason: 'costuma fazer T1; 3 h na semana' },
      { slot: 'V2', person: 'P17', reason: 'técnico com histórico em T1' },
    ]);
    const req = gemini.requests[0];
    expect(req?.model).toBe('gemini-2.5-flash');
    expect(req?.body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: expect.any(Object) });
    expect(JSON.parse(req?.body.contents[0]?.parts[0]?.text ?? '')).toEqual({ slots: batch.slots, people: batch.people });
  });

  it('UT-129 resposta fora do schema lança AiError invalid_response', async () => {
    gemini.queue.push({ body: fixture('gemini/invalid.json') });
    await expect(provider.propose(batch)).rejects.toMatchObject({ name: 'AiError', kind: 'invalid_response' });
  });

  it('UT-130 429 com retryDelay 20s seguido de 200 espera 20 s e devolve o resultado', async () => {
    gemini.queue.push(GeminiFake.error('429'), { body: fixture('gemini/propose.json') });
    const res = await provider.propose(batch);
    expect(res).toHaveLength(2);
    expect(clock.slept).toEqual([20_000]);
    expect(gemini.requests).toHaveLength(2);
  });

  it('UT-131 dois 429 seguidos lançam AiError quota', async () => {
    gemini.queue.push(GeminiFake.error('429'), GeminiFake.error('429'), { body: fixture('gemini/propose.json') });
    const err = await provider.propose(batch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err).toMatchObject({ kind: 'quota' });
    expect(gemini.requests).toHaveLength(2);
  });

  it('UT-132 testKey com 400 API_KEY_INVALID devolve invalid_key', async () => {
    gemini.model = GeminiFake.error('400-invalid-key');
    expect(await provider.testKey('AIzaSy-chave-errada')).toEqual({ ok: false, reason: 'invalid_key' });
    gemini.model = GeminiFake.error('503');
    expect(await provider.testKey('AIzaSy-chave-de-teste')).toEqual({ ok: false, reason: 'unavailable' });
    gemini.model = { body: fixture('gemini/model.json') };
    expect(await provider.testKey('AIzaSy-chave-de-teste')).toEqual({ ok: true });
    expect(gemini.modelRequests.at(-1)?.key).toBe('AIzaSy-chave-de-teste');
  });

  it('classify devolve tipo e certeza no formato pedido', async () => {
    gemini.queue.push({ body: fixture('gemini/classify.json') });
    expect(await provider.classify({ items: [{ id: 'E1', title: 'Live de lançamento' }], types: [{ code: 'T3', name: 'Transmissão ao vivo' }] }))
      .toEqual([{ id: 'E1', type: 'T3', certainty: 'media' }]);
  });
});
