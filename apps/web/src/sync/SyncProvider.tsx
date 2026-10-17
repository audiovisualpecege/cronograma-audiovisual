import { liveQuery } from 'dexie';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LocalStore } from './localStore';
import type { SyncEngine, SyncState } from './syncEngine';
import { useOnline } from './useOnline';

const SyncContext = createContext<SyncEngine | null>(null);

/** Liga o SyncEngine à conexão do aparelho e o entrega às telas. */
export function SyncProvider({ engine, children }: { engine: SyncEngine; children: ReactNode }) {
  const online = useOnline();
  useEffect(() => {
    engine.setOnline(online);
  }, [engine, online]);
  useEffect(() => {
    void engine.start().catch(() => undefined);
    return () => engine.stop();
  }, [engine]);
  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>;
}

export function useSyncEngine(): SyncEngine {
  const engine = useContext(SyncContext);
  if (!engine) throw new Error('useSyncEngine fora do SyncProvider');
  return engine;
}

/** Estado da sincronização: conexão, "a enviar", conflitos, recusas e idade da cópia. */
export function useSyncState(): SyncState {
  const engine = useSyncEngine();
  return useSyncExternalStore(engine.subscribe, engine.getState, engine.getState);
}

/** Consulta viva na cópia local: a tela redesenha quando a tabela muda (envio, leitura ou Realtime). */
export function useLocalQuery<T>(query: (store: LocalStore) => Promise<T>, deps: unknown[]): T | undefined {
  const engine = useSyncEngine();
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(() => query(engine.store)).subscribe({ next: setValue, error: () => undefined });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ...deps]);
  return value;
}
