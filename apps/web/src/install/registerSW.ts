import { registerSW } from 'virtual:pwa-register';

/**
 * Registra o service worker do app instalável. A versão nova fica esperando e assume quando o app é fechado e
 * aberto de novo (sem recarregar no meio do uso); o aviso "Atualizado para vX.Y.Z" vem do UpdateNotice.
 * Fora de http(s), como no protocolo do programa de desktop, não há service worker.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
  registerSW({ immediate: true });
}
