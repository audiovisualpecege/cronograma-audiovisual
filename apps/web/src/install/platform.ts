// Onde o app está rodando: instalado (tela cheia) ou no navegador, e qual navegador, para a instrução de
// instalar e a nota das notificações no iPhone (US-021).

export type BrowserKind = 'ios' | 'firefox-android' | 'samsung' | 'android' | 'desktop';

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true);
}

export function browserKind(ua = navigator.userAgent): BrowserKind {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) {
    if (/Firefox/i.test(ua)) return 'firefox-android';
    if (/SamsungBrowser/i.test(ua)) return 'samsung';
    return 'android';
  }
  return 'desktop';
}

/** Pedido de instalação guardado do `beforeinstallprompt` (Chrome, Edge, Samsung). */
export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

/** Guarda o pedido de instalação desde a abertura do app; o navegador só o oferece uma vez. */
export function listenInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    for (const l of listeners) l();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const l of listeners) l();
  });
}

export function installPrompt(): InstallPrompt | null {
  return deferred;
}

export function onInstallPrompt(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function clearInstallPrompt(): void {
  deferred = null;
  for (const l of listeners) l();
}
