import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from './clock.ts';
import { HEARTBEAT_MS, Heartbeat } from './heartbeat.ts';
import { silentLogger } from './log.ts';
import { Scheduler } from './scheduler.ts';
import { FakeStore } from './test/fakeStore.ts';

const NOW = new Date('2026-10-21T12:00:00-03:00');
const minutes = (n: number) => n * 60_000;

describe('Scheduler e Heartbeat (relógio falso)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('UT-145 releitura desligada não cria jobs; com 15 min cria um a cada 15 min', async () => {
    const off = new FakeStore();
    off.settingsRow.calendar_poll_enabled = false;
    const s1 = new Scheduler(off, systemClock, silentLogger());
    s1.start();
    await vi.advanceTimersByTimeAsync(minutes(60));
    s1.stop();
    expect(off.enqueued.filter((j) => j.kind === 'calendar_sync')).toHaveLength(0);

    const on = new FakeStore();
    const s2 = new Scheduler(on, systemClock, silentLogger());
    s2.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(on.enqueued).toEqual([{ kind: 'calendar_sync', payload: {}, dedupe: 'all' }]);
    await vi.advanceTimersByTimeAsync(minutes(14));
    expect(on.enqueued).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(minutes(1));
    expect(on.enqueued).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(minutes(30));
    s2.stop();
    expect(on.enqueued).toHaveLength(4);
  });

  it('UT-146 lembrete de alterações não publicadas: 2 h 1 min cria uma vez; 1 h 59 min e semana B, nada', async () => {
    const store = new FakeStore();
    const s = new Scheduler(store, systemClock, silentLogger());
    const ago = (m: number) => new Date(NOW.getTime() - minutes(m)).toISOString();

    store.dirtyWeeks = [{ id: 'wA', week_start: '2026-10-19', dirty_since: ago(119) }];
    expect(await s.remindUnpublished(systemClock.now())).toBe(0);
    expect(store.notices).toHaveLength(0);

    store.dirtyWeeks = [
      { id: 'wA', week_start: '2026-10-19', dirty_since: ago(121) },
      { id: 'wB', week_start: '2026-10-26', dirty_since: ago(500) },
    ];
    expect(await s.remindUnpublished(systemClock.now())).toBe(1);
    await s.remindUnpublished(systemClock.now());
    expect(store.notices).toHaveLength(1);
    expect(store.notices[0]).toMatchObject({ kind: 'unpublished_changes', once: true, title: 'Alterações não publicadas' });
    expect(store.notices[0]?.body).toContain('19/10');
  });

  it('UT-148 o batimento grava worker_seen_at a cada 60 s', async () => {
    const store = new FakeStore();
    const hb = new Heartbeat(store, systemClock, silentLogger(), '1.0.0');
    hb.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.workerSeen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    hb.stop();
    expect(store.workerSeen).toHaveLength(4);
    const gaps = store.workerSeen.slice(1).map((d, i) => d.getTime() - (store.workerSeen[i] as Date).getTime());
    expect(gaps).toEqual([60_000, 60_000, 60_000]);
  });

  it('agenda conectada sem leitura boa há mais de 3 intervalos avisa os administradores uma vez', async () => {
    const store = new FakeStore();
    const src = {
      id: 's1', google_calendar_id: 'pecegeworks@gmail.com', label: 'pecegeworks', enabled: true,
      status: 'connected' as const, last_synced_at: new Date(NOW.getTime() - minutes(45)).toISOString(), last_error: null,
    };
    store.sourceRows = [src];
    const s = new Scheduler(store, systemClock, silentLogger());
    expect(await s.alertStaleSources(systemClock.now())).toBe(0);
    store.sourceRows = [{ ...src, last_synced_at: new Date(NOW.getTime() - minutes(46)).toISOString() }];
    expect(await s.alertStaleSources(systemClock.now())).toBe(1);
    await s.alertStaleSources(systemClock.now());
    expect(store.notices).toEqual([expect.objectContaining({ kind: 'calendar_stale', title: 'Agenda pecegeworks sem leitura desde 21/10 11:14', once: true })]);
  });

  it('sem a conta de serviço do Google não cria releituras automáticas', async () => {
    const store = new FakeStore();
    expect(await new Scheduler(store, systemClock, silentLogger(), { calendarReady: false }).pollCalendar(NOW)).toBe(false);
    expect(store.enqueued).toEqual([]);
  });

  it('limpeza apaga avisos de mais de 30 dias e roda no máximo uma vez por hora', async () => {
    const store = new FakeStore();
    const s = new Scheduler(store, systemClock, silentLogger());
    s.start();
    await vi.advanceTimersByTimeAsync(minutes(61));
    s.stop();
    expect(store.deletedBefore.map((d) => NOW.getTime() - d.getTime())).toEqual([30 * 86_400_000, 30 * 86_400_000 - minutes(60)]);
  });
});
