import { fingerprint } from '@cronograma/core';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../log.ts';
import type { SourceRow, StoredEventRow } from '../store.ts';
import { FakeStore } from '../test/fakeStore.ts';
import { GoogleFake, fakeClock, fixture, testServiceAccount } from '../test/mocks.ts';
import { GoogleCalendar } from './google.ts';
import { CalendarSync, syncWindow } from './sync.ts';

const google = new GoogleFake();
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const S1: SourceRow = {
  id: 'src-1', google_calendar_id: 'pecegeworks@gmail.com', label: 'pecegeworks', enabled: true,
  status: 'connected', last_synced_at: '2026-10-21T14:45:00.000Z', last_error: null,
};

const noClassifier = { classify: async () => ({ types: new Map(), aiCalls: 0, aiQuotaHits: 0 }) };

function stored(over: Partial<StoredEventRow> & { google_event_id: string }): StoredEventRow & { calendar_source_id: string } {
  const row = {
    id: `ev-${over.google_event_id}`, week_start: '2026-10-19', title: 'Gravação aula Matemática', location: 'Estúdio 1',
    description: null, starts_at: '2026-10-22T17:00:00.000Z', ends_at: '2026-10-22T20:00:00.000Z', all_day: false,
    status: 'active' as const, change_original: null, fingerprint: null, calendar_source_id: S1.id, ...over,
  };
  return row;
}

let store: FakeStore;
let clock: ReturnType<typeof fakeClock>;
let sync: CalendarSync;

beforeEach(() => {
  google.calls = [];
  google.lists.clear();
  google.events.clear();
  server.use(...google.handlers());
  store = new FakeStore();
  store.sourceRows = [{ ...S1 }];
  clock = fakeClock();
  sync = new CalendarSync(store, new GoogleCalendar(testServiceAccount(), clock), noClassifier, clock, silentLogger());
});

describe('CalendarSync', () => {
  it.each([403, 404])('UT-124 %i do Google marca a origem error e avisa cada administrador', async (status) => {
    google.list(S1.google_calendar_id, status);
    const res = await sync.run();
    const src = store.sourceRows[0] as SourceRow;
    expect(src.status).toBe('error');
    expect(src.last_error).toBe(status === 403 ? 'The caller does not have permission' : 'Not Found');
    expect(store.notices).toEqual([
      expect.objectContaining({ kind: 'calendar_disconnected', title: 'Agenda pecegeworks desconectada desde 21/10 12:00', link: '#/admin/configuracao' }),
    ]);
    expect(store.disconnected).toEqual([{ sourceId: S1.id, flag: true }]);
    expect(res).toMatchObject({ failed_sources: 1 });
    // Na segunda falha seguida não há alerta novo.
    await sync.run();
    expect(store.notices).toHaveLength(1);
  });

  it('UT-125 503 mantém os eventos, grava last_error e não mexe em last_synced_at', async () => {
    store.stored = [stored({ google_event_id: 'g-e1' })];
    google.list(S1.google_calendar_id, 503);
    await sync.run();
    expect(store.sourceRows[0]).toMatchObject({
      status: 'connected', last_synced_at: S1.last_synced_at, last_error: 'The service is currently unavailable.',
    });
    expect(store.applied).toEqual([]);
    expect(store.notices).toEqual([]);
  });

  it('UT-126 nextPageToken busca a segunda página e junta os itens', async () => {
    google.list(S1.google_calendar_id, 'google/page-1.json', 'google/page-2.json');
    const res = await sync.run();
    const lists = google.calls.filter((c) => c.url.pathname.endsWith('/events'));
    expect(lists).toHaveLength(2);
    expect(lists[1]?.url.searchParams.get('pageToken')).toBe(fixture<{ nextPageToken: string }>('google/page-1.json').nextPageToken);
    expect(store.applied.map((a) => a.googleId)).toEqual(['g-e0', 'g-e1', 'g-b1', 'g-b2', 'g-b5', 'g-b6', 'g-b7']);
    expect(res).toMatchObject({ events_new: 7 });
    // Janela de 10 semanas: da semana anterior ao fim da 8ª à frente, singleEvents e showDeleted.
    const q = lists[0]?.url.searchParams;
    expect(q?.get('singleEvents')).toBe('true');
    expect(q?.get('showDeleted')).toBe('true');
    expect(q?.get('timeMin')).toBe(syncWindow(clock.now()).timeMin.toISOString());
    expect(q?.get('timeMin')).toBe('2026-10-12T03:00:00.000Z');
    expect(q?.get('timeMax')).toBe('2026-12-21T03:00:00.000Z');
  });

  it('UT-127 evento ausente da janela chama events.get: 404 vira cancelled, outra semana vira moved_week', async () => {
    const cal = S1.google_calendar_id;
    store.stored = [stored({ google_event_id: 'g-gone' }), stored({ google_event_id: 'g-e1' })];
    google.list(cal, 'google/empty.json');
    google.events.set(`${cal}/g-e1`, { body: fixture('google/event-moved.json') });
    await sync.run();
    const gets = google.calls.filter((c) => /\/events\/.+/.test(c.url.pathname)).map((c) => decodeURIComponent(c.url.pathname.split('/').pop() as string));
    expect(gets.sort()).toEqual(['g-e1', 'g-gone']);
    const kinds = Object.fromEntries(store.applied.map((a) => [a.googleId, a.change]));
    expect(kinds['g-gone']).toMatchObject({ kind: 'cancelled', weekStart: '2026-10-19', notify: true });
    expect(kinds['g-e1']).toMatchObject({ kind: 'moved_week', from: '2026-10-19', to: '2026-10-26' });
  });

  it('UT-156 duas ocorrências de um recorrente viram dois eventos', async () => {
    google.list(S1.google_calendar_id, 'google/recurring.json');
    await sync.run();
    expect(store.applied.map((a) => [a.googleId, a.change.kind])).toEqual([
      ['r7k2_20261026T120000Z', 'new'],
      ['r7k2_20261028T120000Z', 'new'],
    ]);
  });

  it('campos que não aparecem (cor, lembretes) não contam como mudança', async () => {
    const snap = {
      title: 'Gravação aula Química', location: 'Estúdio 2', description: null,
      startsAt: '2026-10-27T14:00:00-03:00', endsAt: '2026-10-27T17:00:00-03:00', allDay: false,
    };
    store.stored = [stored({
      google_event_id: 'g-b2', week_start: '2026-10-26', title: snap.title, location: snap.location,
      starts_at: '2026-10-27T17:00:00.000Z', ends_at: '2026-10-27T20:00:00.000Z', fingerprint: fingerprint(snap),
    })];
    google.list(S1.google_calendar_id, { body: { items: [fixture<{ items: { id: string }[] }>('google/week-b.json').items.find((i) => i.id === 'g-b2')] } });
    await sync.run();
    expect(store.applied).toEqual([]);
    expect(google.nonGet).toEqual([]);
  });

  it('evento que começa antes da janela e entra nela é comparado com a linha guardada, não tratado como novo', async () => {
    store.stored = [stored({
      google_event_id: 'g-longo', week_start: '2026-10-05', title: 'Feira do agronegócio', location: 'Parque',
      starts_at: '2026-10-11T12:00:00.000Z', ends_at: '2026-10-13T21:00:00.000Z',
    })];
    const ev = {
      id: 'g-longo', status: 'confirmed', summary: 'Feira do agronegócio', location: 'Parque de exposições',
      start: { dateTime: '2026-10-11T09:00:00-03:00' }, end: { dateTime: '2026-10-13T18:00:00-03:00' },
    };
    google.list(S1.google_calendar_id, { body: { items: [ev] } });
    await sync.run();
    expect(store.applied.map((a) => [a.googleId, a.change.kind])).toEqual([['g-longo', 'changed']]);
  });

  it('origem desativada não é lida e os eventos escalados dela ganham a marca', async () => {
    store.sourceRows = [{ ...S1, enabled: false }];
    const res = await sync.run();
    expect(google.calls).toEqual([]);
    expect(store.disconnected).toEqual([{ sourceId: S1.id, flag: true }]);
    expect(res).toMatchObject({ sources: [expect.objectContaining({ status: 'disabled' })] });
  });
});
