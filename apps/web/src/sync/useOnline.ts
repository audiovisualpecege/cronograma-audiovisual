import { useSyncExternalStore } from 'react';

// Conexão do aparelho pelo navegador (online/offline). A falha de rede numa chamada também conta como
// "sem internet" dentro do SyncEngine, que só volta a tentar quando o navegador avisa a volta.
function subscribe(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export const isOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
