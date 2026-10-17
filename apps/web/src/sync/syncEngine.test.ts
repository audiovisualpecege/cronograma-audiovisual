import { describe, expect, it, vi } from 'vitest';
import { FakeRemote, fakeFetch, json, memoryStorage } from '../../test/fakeRemote';
import { createSupabaseRemote } from '../supabase';
import { LocalStore } from './localStore';
import { SyncEngine } from './syncEngine';
import type { Row } from './types';

const SLOT = '30000000-0000-4000-8000-000000000011';
const P5 = 'd0000000-0000-4000-8000-000000000005';
const P6 = 'd0000000-0000-4000-8000-000000000006';

function assignmentRow(over: Partial<Row> = {}): Row {
  return { id: 'a1', slot_id: SLOT, person_id: null, status: null, version: 3, updated_at: '2026-10-21T14:00:00.000000+00:00', ...over };
}

let clock = Date.parse('2026-10-21T15:00:00.000Z');
const now = () => new Date((clock += 1000));
let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

async function setup(options: { online?: boolean; remote?: FakeRemote; name?: string } = {}) {
  const remote = options.remote ?? new FakeRemote();
  const store = new LocalStore(options.name ?? 'teste');
  const engine = new SyncEngine({ store, remote, profile: 'admin', online: options.online ?? true, now, newId });
  await store.mirror('assignments').put(assignmentRow());
  return { remote, store, engine };
}

const setP5 = (engine: SyncEngine) =>
  engine.enqueue('assignment.set', { slot_id: SLOT, person_id: P5 }, {
    baseVersion: 3,
    target: { table: 'assignments', id: 'a1', changes: { person_id: P5, status: 'confirmed' } },
  });

describe('SyncEngine e LocalStore', () => {
  it('UT-071 sem rede, assignment.set entra na outbox e a contagem "a enviar" fica 1', async () => {
    const { engine, store, remote } = await setup({ online: false });
    await setP5(engine);
    expect(await store.outbox.count()).toBe(1);
    expect(engine.getState().pending).toBe(1);
    expect(engine.getState().pendingRows.has('assignments:a1')).toBe(true);
    expect((await store.mirror('assignments').get('a1'))?.person_id).toBe(P5);
    expect(remote.applyCalls).toHaveLength(0);
  });

  it('UT-072 envio com resultado applied tira a operação da fila e grava a version nova na linha local', async () => {
    const { engine, store, remote } = await setup({ online: false });
    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'applied', version: 4 }));
    await setP5(engine);
    engine.setOnline(true);
    await engine.flush();
    expect(await store.outbox.count()).toBe(0);
    expect(engine.getState().pending).toBe(0);
    const row = await store.mirror('assignments').get('a1');
    expect(row?.version).toBe(4);
    expect(row?.person_id).toBe(P5);
  });

  it('UT-073 resultado conflict move a operação para conflicts com a versão local e a do servidor', async () => {
    const { engine, store, remote } = await setup({ online: false });
    const server = assignmentRow({ person_id: P6, status: 'confirmed', version: 5 });
    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'conflict', server, local: o.payload }));
    const entry = await setP5(engine);
    engine.setOnline(true);
    await engine.flush();
    expect(await store.outbox.count()).toBe(0);
    const conflict = await store.conflicts.get(entry.opId);
    expect(conflict?.server).toEqual(server);
    expect(conflict?.local).toEqual({ slot_id: SLOT, person_id: P5 });
    expect(conflict?.op.kind).toBe('assignment.set');
    expect(engine.getState().conflicts).toHaveLength(1);
  });

  it('UT-074 escolher "minha versão" reenvia com baseVersion igual à versão do servidor', async () => {
    const { engine, store, remote } = await setup({ online: false });
    const server = assignmentRow({ person_id: P6, version: 5 });
    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'conflict', server, local: o.payload }));
    const entry = await setP5(engine);
    engine.setOnline(true);
    await engine.flush();

    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'applied', version: 6 }));
    await engine.resolveConflict(entry.opId, 'mine');
    const resent = remote.applyCalls.at(-1)?.[0];
    expect(resent?.opId).toBe(entry.opId);
    expect(resent?.baseVersion).toBe(5);
    expect(await store.conflicts.count()).toBe(0);
    expect(await store.outbox.count()).toBe(0);
    expect((await store.mirror('assignments').get('a1'))?.version).toBe(6);
  });

  it('UT-075 escolher "versão do servidor" descarta a operação e grava a linha do servidor', async () => {
    const { engine, store, remote } = await setup({ online: false });
    const server = assignmentRow({ person_id: P6, status: 'confirmed', version: 5 });
    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'conflict', server, local: o.payload }));
    const entry = await setP5(engine);
    engine.setOnline(true);
    await engine.flush();
    const sent = remote.applyCalls.length;

    await engine.resolveConflict(entry.opId, 'server');
    expect(remote.applyCalls).toHaveLength(sent);
    expect(await store.conflicts.count()).toBe(0);
    expect(await store.outbox.count()).toBe(0);
    expect(await store.mirror('assignments').get('a1')).toEqual(server);
  });

  it('UT-076 resultado rejected com event_cancelled tira a operação e guarda o motivo para o administrador', async () => {
    const { engine, store, remote } = await setup({ online: false });
    remote.applyHandler = (ops) =>
      ops.map((o) => ({ opId: o.opId, status: 'rejected', code: 'event_cancelled', message: 'Evento cancelado não aceita alocações.' }));
    const entry = await setP5(engine);
    engine.setOnline(true);
    await engine.flush();
    expect(await store.outbox.count()).toBe(0);
    expect(engine.getState().rejections).toEqual([
      expect.objectContaining({ opId: entry.opId, code: 'event_cancelled', message: 'Evento cancelado não aceita alocações.' }),
    ]);
    // A mudança recusada sai da cópia local: a linha volta a ser a de antes.
    expect((await store.mirror('assignments').get('a1'))?.person_id).toBeNull();
    await engine.dismissRejection(entry.opId);
    expect(engine.getState().rejections).toHaveLength(0);
  });

  it('UT-077 três operações enfileiradas vão em createdAt crescente', async () => {
    const { engine, remote } = await setup({ online: false });
    const a = await engine.enqueue('person.upsert', { name: 'A' });
    const b = await engine.enqueue('absence.upsert', { person_id: P5 });
    const c = await engine.enqueue('settings.update', { calendar_poll_minutes: 30 });
    engine.setOnline(true);
    await engine.flush();
    const sent = remote.applyCalls[0] ?? [];
    expect(sent.map((o) => o.opId)).toEqual([a.opId, b.opId, c.opId]);
    const times = sent.map((o) => o.createdAt);
    expect([...times].sort()).toEqual(times);
    expect(new Set(times).size).toBe(3);
  });

  it('UT-078 rede cai no meio do envio; o reenvio usa os mesmos opId', async () => {
    const { engine, store, remote } = await setup({ online: false });
    const a = await engine.enqueue('person.upsert', { name: 'A' });
    const b = await setP5(engine);
    engine.setOnline(true);
    remote.offline = true;
    await expect(engine.flush()).rejects.toMatchObject({ network: true });
    expect(await store.outbox.count()).toBe(2);

    remote.offline = false;
    await engine.flush();
    expect(remote.applyCalls).toHaveLength(2);
    expect(remote.applyCalls[1]?.map((o) => o.opId)).toEqual([a.opId, b.opId]);
    expect(remote.applyCalls[1]?.map((o) => o.opId)).toEqual(remote.applyCalls[0]?.map((o) => o.opId));
    expect(await store.outbox.count()).toBe(0);
  });

  it("UT-079 pull('events') pede updated_at=gt.<cursor> e avança o cursor para o maior updated_at recebido", async () => {
    const cursor = '2026-10-21T10:00:00.000000+00:00';
    const rows = [
      { id: 'e1', title: 'Gravação', version: 2, updated_at: '2026-10-21T11:00:00.123456+00:00' },
      { id: 'e2', title: 'Congresso', version: 1, updated_at: '2026-10-21T12:30:00.654321+00:00' },
    ];
    const fetch = fakeFetch(() => json(rows));
    const remote = createSupabaseRemote({ url: 'http://supabase.test', key: 'chave-publica', fetch, storage: memoryStorage() });
    const store = new LocalStore('ut-079');
    await store.cursors.put({ table: 'events', updatedAt: cursor });
    const engine = new SyncEngine({ store, remote, profile: 'team', now, newId });

    expect(await engine.pull('events')).toBe(2);
    const url = new URL(fetch.calls[0]?.url ?? '');
    expect(url.pathname).toBe('/rest/v1/events');
    expect(url.searchParams.get('updated_at')).toBe(`gt.${cursor}`);
    expect(url.searchParams.get('order')).toBe('updated_at.asc,id.asc');
    expect(await store.getCursor('events')).toBe('2026-10-21T12:30:00.654321+00:00');
    expect(await store.mirror('events').count()).toBe(2);
  });

  it('UT-080 evento Realtime de notifications dispara pull("notifications") e nenhuma outra tabela', async () => {
    const remote = new FakeRemote();
    const { engine } = await setup({ remote, online: false });
    await engine.start();
    expect(remote.subscribedTables()).toEqual(expect.arrayContaining(['notifications', 'events', 'assignments']));
    remote.pullCalls = [];
    remote.rows.notifications = [{ id: 'n1', title: 'Sua semana mudou', version: 1, updated_at: '2026-10-21T15:00:00+00:00' }];
    remote.emit('notifications');
    await vi.waitFor(async () => expect(await engine.store.mirror('notifications').count()).toBe(1));
    expect(remote.pullCalls.map((c) => c.table)).toEqual(['notifications']);
    engine.stop();
  });

  it('UT-174 operação na outbox, Dexie fechado e reaberto: a operação continua lá e é enviada quando a rede volta', async () => {
    const remote = new FakeRemote();
    const first = await setup({ remote, online: false, name: 'ut-174' });
    const entry = await setP5(first.engine);
    first.engine.stop();
    first.store.close();

    const store = new LocalStore('ut-174');
    const engine = new SyncEngine({ store, remote, profile: 'admin', online: false, now, newId });
    await engine.start();
    expect((await store.outbox.toArray()).map((o) => o.opId)).toEqual([entry.opId]);
    expect(engine.getState().pending).toBe(1);
    expect(remote.applyCalls).toHaveLength(0);

    engine.setOnline(true);
    await vi.waitFor(async () => expect(await store.outbox.count()).toBe(0));
    expect(remote.applyCalls[0]?.map((o) => o.opId)).toEqual([entry.opId]);
    engine.stop();
  });

  it('a leitura incremental não apaga a mudança que ainda espera envio e pagina por updated_at e id', async () => {
    const remote = new FakeRemote();
    const { engine, store } = await setup({ remote, online: false });
    await setP5(engine);
    remote.rows.assignments = [assignmentRow({ person_id: P6, version: 4, updated_at: '2026-10-21T16:00:00+00:00' })];
    await engine.pull('assignments');
    const row = await store.mirror('assignments').get('a1');
    expect(row?.person_id).toBe(P5);
    expect(row?.version).toBe(4);
  });

  it('avisos lidos sem rede ficam no aparelho e vão ao servidor ao reconectar', async () => {
    const remote = new FakeRemote();
    const { engine, store } = await setup({ remote, online: false });
    await store.mirror('notifications').put({ id: 'n1', version: 1, updated_at: '2026-10-21T15:00:00+00:00', read_at: null });
    await engine.markNotificationsRead(['n1']);
    expect((await store.mirror('notifications').get('n1'))?.read_at).toBeTruthy();
    expect(remote.readCalls).toHaveLength(0);
    await engine.start();
    engine.setOnline(true);
    await vi.waitFor(() => expect(remote.readCalls.map((c) => c.ids)).toEqual([['n1']]));
    expect(await store.pendingReads.count()).toBe(0);
    engine.stop();
  });

  it('ação "Precisa de internet" sem rede é recusada sem chamar o servidor', async () => {
    const remote = new FakeRemote();
    const { engine } = await setup({ remote, online: false });
    await expect(engine.runOnline((r) => r.rpc('publish_week', {}))).rejects.toMatchObject({ code: 'offline' });
    expect(remote.rpcCalls).toHaveLength(0);
  });
});
