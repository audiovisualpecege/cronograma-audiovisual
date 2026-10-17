import { describe, expect, it } from 'vitest';
import { silentLogger } from './log.ts';
import { JobFailure, JobQueue } from './queue.ts';
import type { JobRow } from './store.ts';
import { FakeStore } from './test/fakeStore.ts';

const job = (id: string, status: JobRow['status'] = 'queued', kind: JobRow['kind'] = 'calendar_sync'): JobRow => ({
  id, kind, status, payload: {}, result: null, error: null, requested_by: null, created_at: '2026-10-21T15:00:00Z',
});

describe('JobQueue', () => {
  it('UT-123 claim de um job já running devolve null', async () => {
    const store = new FakeStore();
    store.jobs = [job('j1', 'running'), job('j2')];
    const queue = new JobQueue(store, {}, silentLogger());
    expect(await queue.claim('j1')).toBeNull();
    expect(await queue.claim('j2')).toMatchObject({ id: 'j2', status: 'running' });
    // O segundo consumidor que tenta o mesmo job também fica sem ele.
    expect(await queue.claim('j2')).toBeNull();
  });

  it('grava done com o resultado, failed com o texto do erro, e esvazia a fila em ordem', async () => {
    const store = new FakeStore();
    store.jobs = [job('a'), job('b', 'queued', 'propose'), job('c', 'queued', 'invite')];
    const order: string[] = [];
    const queue = new JobQueue(
      store,
      {
        calendar_sync: async (j) => (order.push(j.id), { events_new: 2 }),
        propose: async (j, progress) => {
          order.push(j.id);
          await progress({ batches_done: 1 });
          throw new JobFailure('A IA não respondeu agora; monte à mão ou tente mais tarde.', { batches_done: 1 });
        },
      },
      silentLogger(),
    );
    await queue.drain();
    expect(order).toEqual(['a', 'b']);
    expect(store.jobs.map((j) => [j.id, j.status, j.error])).toEqual([
      ['a', 'done', null],
      ['b', 'failed', 'A IA não respondeu agora; monte à mão ou tente mais tarde.'],
      ['c', 'failed', 'Tipo de pedido sem tratamento: invite'],
    ]);
    expect(store.jobs[0]?.result).toEqual({ events_new: 2 });
    expect(store.jobs[1]?.result).toEqual({ batches_done: 1 });
  });
});
