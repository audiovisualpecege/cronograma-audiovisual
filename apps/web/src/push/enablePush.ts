// Notificação no celular por Web Push (US-023): permissão do aparelho, inscrição no serviço de push do
// navegador com a chave pública VAPID e registro dela no servidor por `register_push`. O envio é do
// serviço de fundo no NAS; o service worker (sw.ts) mostra a notificação e abre o link.
import type { Remote } from '../supabase';
import { browserKind, isStandalone } from '../install/platform';

/** Este aparelho já ativou as notificações (para pedir "Reativar" quando a inscrição some, US-023 EC-3). */
export const DEVICE_KEY = 'cronograma-push-device';

export type PushStatus = 'unconfigured' | 'unsupported' | 'install_first' | 'denied' | 'default' | 'granted';

export function vapidKey(): string | undefined {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || undefined;
}

function supported(): boolean {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined';
}

/** Situação das notificações neste aparelho. */
export function pushStatus(): PushStatus {
  // No iPhone, notificação só com o app na tela inicial (iOS 16.4 ou mais novo).
  if (browserKind() === 'ios' && !isStandalone()) return 'install_first';
  if (!supported()) return 'unsupported';
  if (!vapidKey()) return 'unconfigured';
  return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default';
}

/** Chave VAPID em base64url para o formato do `pushManager.subscribe`. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export type EnableResult = { ok: true } | { ok: false; reason: 'denied' | 'dismissed' | 'unsupported' | 'failed'; message?: string };

/** Pede a permissão, inscreve o aparelho e registra a inscrição no servidor. */
export async function enablePush(remote: Remote): Promise<EnableResult> {
  const key = vapidKey();
  if (!supported() || !key) return { ok: false, reason: 'unsupported' };
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission === 'denied') return { ok: false, reason: 'denied' };
  if (permission !== 'granted') return { ok: false, reason: 'dismissed' };
  try {
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    await remote.rpc('register_push', { ...sub.toJSON(), userAgent: navigator.userAgent });
    localStorage.setItem(DEVICE_KEY, '1');
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'failed', message: e instanceof Error ? e.message : undefined };
  }
}

/** Desliga as notificações deste aparelho: a inscrição é cancelada e o servidor a apaga no próximo envio. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  await sub?.unsubscribe();
  localStorage.removeItem(DEVICE_KEY);
}

/** A pessoa quer notificações, este aparelho já tinha ativado e a inscrição sumiu (comum no iPhone). */
export async function needsReactivation(personPushEnabled: boolean): Promise<boolean> {
  if (!personPushEnabled || localStorage.getItem(DEVICE_KEY) !== '1') return false;
  if (pushStatus() !== 'granted') return false;
  return (await currentSubscription()) === null;
}
