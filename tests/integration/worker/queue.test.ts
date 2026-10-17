// Fila jobs no banco real: a reivindicação é atômica e o batimento grava worker_seen_at.
import { describe, expect, it } from 'vitest';
import { one, useSeed } from '../helpers/supabase.ts';
import { enqueue, useWorker } from './harness.ts';

describe('fila e batimento no banco real', () => {
  useSeed();
  const ctx = useWorker();

  it('dois consumidores ao mesmo tempo: só um reivindica o job', async () => {
    const id = await enqueue('ical_publish', { person_id: 'd0000000-0000-4000-8000-000000000005' }, 'x');
    const claims = await Promise.all([ctx.store.claimJob(id), ctx.store.claimJob(id), ctx.store.claimJob(id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await one('select status from public.jobs where id = $1', [id])).toEqual({ status: 'running' });
    expect(await ctx.store.requeueRunning()).toBe(1);
  });

  it('o batimento grava settings.worker_seen_at', async () => {
    await ctx.worker.heartbeat.beat();
    const { worker_seen_at } = await one<{ worker_seen_at: Date }>('select worker_seen_at from public.settings');
    expect(worker_seen_at.toISOString().slice(0, 13)).toBe('2026-10-21T15');
  });
});
