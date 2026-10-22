import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../log.ts';
import type { NotificationRow } from '../store.ts';
import { FakeStore } from '../test/fakeStore.ts';
import { PushFake, TEST_VAPID, fakeClock } from '../test/mocks.ts';
import { Notifier, webPushSender } from './notifier.ts';

const push = new PushFake();
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const notice = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: 'n1', person_id: 'p5', kind: 'event_changed', title: 'Mudou: Gravação aula Matemática',
  body: 'Antes: 22/10 14:00 às 17:00. Agora: 22/10 15:00 às 18:00.', link: '#/evento/e1',
  // A varredura olha as últimas 24 h pelo relógio real (created_at é a hora do banco): o aviso nasce agora,
  // senão o teste para de passar um dia depois da data escrita aqui.
  dedupe_key: 'calendar:change:e1:abc', pushed_at: null, created_at: new Date(Date.now() - 60_000).toISOString(), version: 1, ...over,
});

let store: FakeStore;
let notifier: Notifier;

beforeEach(() => {
  push.received = [];
  push.status.clear();
  server.use(...push.handlers());
  store = new FakeStore();
  store.people.set('p5', { id: 'p5', active: true, push_enabled: true, ical_token: null });
  notifier = new Notifier(store, webPushSender(TEST_VAPID), fakeClock(), silentLogger());
});

function subscribe(name: string, personId = 'p5') {
  const d = push.device(name);
  store.subs.push({ id: `sub-${name}`, person_id: personId, ...d });
  return d;
}

describe('Notifier', () => {
  it('UT-139 410 do serviço de push apaga a inscrição', async () => {
    const gone = subscribe('celular-antigo');
    const ok = subscribe('celular-novo');
    push.status.set(gone.endpoint, 410);
    const out = await notifier.deliver(notice());
    expect(out).toEqual({ push_sent: 1, push_gone: 1 });
    expect(store.subs.map((s) => s.id)).toEqual(['sub-celular-novo']);
    expect(push.received.map((r) => r.endpoint)).toEqual([ok.endpoint]);
  });

  it('404 também apaga; 500 mantém a inscrição para a próxima', async () => {
    const a = subscribe('a');
    const b = subscribe('b');
    push.status.set(a.endpoint, 404);
    push.status.set(b.endpoint, 500);
    expect(await notifier.deliver(notice())).toEqual({ push_sent: 0, push_gone: 1, failed: 1 });
    expect(store.subs.map((s) => s.id)).toEqual(['sub-b']);
    expect(store.pushed.size).toBe(0);
  });

  it('falha passageira é tentada de novo pela varredura, no máximo 3 vezes', async () => {
    const d = subscribe('instavel');
    push.status.set(d.endpoint, 503);
    store.notifications = [notice()];
    for (let i = 0; i < 5; i++) await notifier.sweep();
    expect(push.received).toHaveLength(0);
    push.status.delete(d.endpoint);
    await notifier.sweep();
    expect(push.received).toHaveLength(0); // já desistiu deste aviso

    store.notifications = [notice({ id: 'n2' })];
    push.status.set(d.endpoint, 503);
    await notifier.sweep();
    push.status.delete(d.endpoint);
    await notifier.sweep();
    expect(push.received.map((r) => r.payload.id)).toEqual(['n2']);
    expect(store.pushed.has('n2')).toBe(true);
  });

  it('UT-140 push desligado da pessoa ou geral não envia e mantém o aviso', async () => {
    subscribe('celular');
    store.notifications = [notice()];
    store.people.set('p5', { id: 'p5', active: true, push_enabled: false, ical_token: null });
    expect(await notifier.deliver(notice())).toMatchObject({ push_sent: 0, skipped: 'person_off' });

    store.people.set('p5', { id: 'p5', active: true, push_enabled: true, ical_token: null });
    store.settingsRow.push_enabled_global = false;
    expect(await notifier.deliver(notice({ id: 'n2' }))).toMatchObject({ push_sent: 0, skipped: 'global_off' });

    expect(push.received).toEqual([]);
    expect(store.notifications).toHaveLength(1);
    expect(store.pushed.size).toBe(0);
  });

  it('UT-141 pessoa com 2 inscrições recebe 2 envios', async () => {
    subscribe('celular');
    subscribe('computador');
    expect(await notifier.deliver(notice())).toEqual({ push_sent: 2, push_gone: 0 });
    expect(push.received).toHaveLength(2);
    expect(store.pushed.has('n1')).toBe(true);
  });

  it('UT-142 um aviso gera um envio com tag = dedupe_key; atualizado, reenvia com a mesma tag', async () => {
    subscribe('celular');
    await notifier.deliver(notice());
    await notifier.deliver(notice()); // mesmo aviso, mesma versão: não repete
    expect(push.received).toHaveLength(1);
    expect(push.received[0]?.payload).toEqual({
      title: 'Mudou: Gravação aula Matemática',
      body: 'Antes: 22/10 14:00 às 17:00. Agora: 22/10 15:00 às 18:00.',
      link: '#/evento/e1',
      tag: 'calendar:change:e1:abc',
      id: 'n1',
    });
    await notifier.deliver(notice({ version: 2, body: 'Antes: 22/10 14:00 às 17:00. Agora: 22/10 16:00 às 19:00.' }));
    expect(push.received).toHaveLength(2);
    expect(push.received[1]?.payload.tag).toBe('calendar:change:e1:abc');
    expect(push.received[1]?.headers.topic).toBe(push.received[0]?.headers.topic);
  });

  it('UT-172 aviso criado às 23:30 é enviado na hora, sem janela de silêncio', async () => {
    subscribe('celular');
    const late = new Notifier(store, webPushSender(TEST_VAPID), fakeClock('2026-10-21T23:30:00-03:00'), silentLogger());
    const out = await late.deliver(notice({ created_at: '2026-10-22T02:30:00Z' }));
    expect(out.push_sent).toBe(1);
    expect(store.pushed.get('n1')?.toISOString()).toBe('2026-10-22T02:30:00.000Z');
  });

  it('aviso de mudança regera o feed iCal de quem tem o link ligado', async () => {
    store.people.set('p5', { id: 'p5', active: true, push_enabled: true, ical_token: 'tok' });
    await notifier.deliver(notice());
    await notifier.deliver(notice({ id: 'n2', kind: 'ai_failed' }));
    expect(store.enqueued).toEqual([{ kind: 'ical_publish', payload: { person_id: 'p5' }, dedupe: 'p5' }]);
  });
});
