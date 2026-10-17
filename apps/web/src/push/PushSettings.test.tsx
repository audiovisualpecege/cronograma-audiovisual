import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAsMe } from '../../test/helpers';
import { teamRemote } from '../../test/teamFixtures';
import { DEVICE_KEY } from './enablePush';
import { PushReminder, PushSettings } from './PushSettings';

const SUB = { endpoint: 'https://push.exemplo.test/aparelho-1', keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' } };

/** Aparelho com service worker e push; `subscription` é a inscrição atual (nula quando sumiu). */
function device(permission: NotificationPermission, subscription: typeof SUB | null) {
  let current = subscription ? { ...subscription, toJSON: () => subscription, unsubscribe: async () => true } : null;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = { ...SUB, toJSON: () => SUB, unsubscribe: async () => true };
      return current;
    }),
  };
  const registration = { pushManager };
  const requestPermission = vi.fn(async () => permission);
  vi.stubGlobal('Notification', { permission, requestPermission });
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) },
  });
  return { pushManager, requestPermission };
}

beforeEach(() => {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe('PushSettings', () => {
  it('UT-104 Notification.permission denied mostra "Notificações bloqueadas no aparelho" e como liberar', async () => {
    device('denied', null);
    renderAsMe(<PushSettings />, { remote: teamRemote() });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Notificações bloqueadas no aparelho');
    expect(alert).toHaveTextContent(/cadeado ao lado do endereço/);
    expect(screen.queryByRole('button', { name: 'Ativar notificações' })).toBeNull();
  });

  it('"Ativar notificações" pede a permissão, inscreve o aparelho e chama register_push', async () => {
    const user = userEvent.setup();
    const { pushManager, requestPermission } = device('granted', null);
    (globalThis.Notification as { permission: string }).permission = 'default';
    const remote = teamRemote();
    renderAsMe(<PushSettings />, { remote });
    await user.click(await screen.findByRole('button', { name: 'Ativar notificações' }));
    await screen.findByText('Notificações ativadas neste aparelho.');
    expect(requestPermission).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(remote.rpcCalls).toEqual([{ fn: 'register_push', args: expect.objectContaining(SUB) }]);
    expect(localStorage.getItem(DEVICE_KEY)).toBe('1');
  });
});

describe('PushReminder', () => {
  it('UT-105 push_enabled=true e getSubscription() nulo ao abrir mostra "Reativar notificações"', async () => {
    const user = userEvent.setup();
    const { pushManager } = device('granted', null);
    localStorage.setItem(DEVICE_KEY, '1');
    const remote = teamRemote({ own: { push_enabled: true } });
    renderAsMe(<PushReminder />, { remote });
    const button = await screen.findByRole('button', { name: 'Reativar notificações' });
    expect(pushManager.getSubscription).toHaveBeenCalled();

    await user.click(button);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reativar notificações' })).toBeNull());
    expect(remote.rpcCalls.map((c) => c.fn)).toEqual(['register_push']);
  });

  it('com a inscrição ativa, nada aparece', async () => {
    device('granted', SUB);
    localStorage.setItem(DEVICE_KEY, '1');
    const view = renderAsMe(<PushReminder />, { remote: teamRemote() });
    await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Reativar notificações' })).toBeNull();
  });
});
