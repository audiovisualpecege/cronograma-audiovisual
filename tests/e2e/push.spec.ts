/// <reference lib="dom" />
// Notificação no aparelho de ponta a ponta (E2E-022): P10 ativa, P1 publica, o worker envia e o service
// worker mostra a notificação. Exige o Chromium completo: o headless shell sempre responde "denied".
import { expect, test, type BrowserContext } from '@playwright/test';
import type { PushPayload } from '../../apps/worker/src/push/notifier.ts';
import { resetDatabase } from '../integration/helpers/db.ts';
import { EVENT, person } from '../integration/helpers/ids.ts';
import { e2eEnv } from './env.ts';
import { isMobile } from './helpers';
import { assign, db, openAs, publishAsP1 } from './team.ts';
import { startWorker, type RunningWorker } from './worker.ts';

test.use({ channel: 'chromium' });

const WEEK_B = '2026-10-26';
const ORIGIN = 'http://127.0.0.1:4173';

test.describe('notificação no aparelho', () => {
  let worker: RunningWorker | null = null;
  test.beforeEach(async () => {
    await resetDatabase(e2eEnv().dbUrl);
  });
  test.afterEach(async () => {
    await worker?.stop();
    worker = null;
  });

  test('E2E-022 P10 ativa notificações; P1 publica; o service worker recebe o push e mostra a notificação', async ({ page, context }, info) => {
    test.skip(isMobile(info), 'push pelo CDP do Chromium de desktop');
    const sent: PushPayload[] = [];
    worker = await startWorker({ pushSender: async (_sub, payload) => void sent.push(payload) });
    await context.grantPermissions(['notifications'], { origin: ORIGIN });
    await fakePushService(context);

    await openAs(page, '/preferencias', 10);
    await page.getByRole('button', { name: 'Ativar notificações' }).click();
    await expect(page.getByText('Notificações ativadas neste aparelho.')).toBeVisible();
    await expect.poll(async () => (await db<{ n: number }>('select count(*)::int as n from public.push_subscriptions where person_id = $1', [person(10)]))[0]?.n).toBe(1);

    await db('select public.build_week_internal($1::date)', [WEEK_B]);
    await assign(EVENT.B2, 5, 10);
    await publishAsP1(WEEK_B);
    await expect.poll(() => sent.find((p) => p.title.includes('26/10')), { timeout: 20_000 }).toBeTruthy();
    const payload = sent.find((p) => p.title.includes('26/10')) as PushPayload;

    // O serviço de push do navegador entrega a mensagem ao service worker (CDP).
    const cdp = await context.newCDPSession(page);
    const registrationId = new Promise<string>((resolve) => {
      cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
        const reg = registrations.find((r) => r.scopeURL.startsWith(`${ORIGIN}/cronograma-audiovisual/`) && !r.isDeleted);
        if (reg) resolve(reg.registrationId);
      });
    });
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId: await registrationId, data: JSON.stringify(payload) });

    await expect
      .poll(async () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, link: (n.data as { link: string }).link }))))
      .toEqual([{ title: payload.title, link: '#/minha-semana/2026-10-26' }]);
  });
});

/**
 * Serviço de push do navegador simulado: o Chromium dos testes não alcança o FCM. A inscrição tem endpoint e
 * chaves fixos, e o resto do caminho (register_push, worker, service worker) é o de verdade.
 */
async function fakePushService(context: BrowserContext) {
  await context.addInitScript(() => {
    const sub = { endpoint: 'https://push.exemplo.test/e2e-p10', expirationTime: null, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
    const make = () => ({ ...sub, options: { userVisibleOnly: true }, toJSON: () => sub, getKey: () => null, unsubscribe: async () => (localStorage.removeItem('e2e-push'), true) });
    PushManager.prototype.subscribe = async function () {
      localStorage.setItem('e2e-push', '1');
      return make() as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      return (localStorage.getItem('e2e-push') ? make() : null) as unknown as PushSubscription | null;
    };
  });
}
