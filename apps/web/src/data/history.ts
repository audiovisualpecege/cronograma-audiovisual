// Histórico (view history_facts): linhas importadas das planilhas mais as semanas publicadas e já passadas.
// Não entra na leitura incremental (a view não tem version nem updated_at): é lido inteiro com internet e
// guardado na cópia local para Padrões e sugestões funcionarem sem internet.
import { useCallback, useEffect, useState } from 'react';
import type { SyncEngine } from '../sync/syncEngine';
import { useSyncEngine, useSyncState } from '../sync/SyncProvider';
import { HISTORY_COLUMNS, HISTORY_ORDER, type HistoryFactRow } from './catalog';

const HISTORY_KEY = 'historyFacts';
/** Funções e tipos escritos na última planilha lida, para as sugestões dos cadastros (US-004 EC-2). */
export const SHEET_LABELS_KEY = 'sheetLabels';

export interface SheetLabels {
  roles: string[];
  types: string[];
}

interface CachedHistory {
  rows: HistoryFactRow[];
  fetchedAt: string;
}

export interface HistoryState {
  rows: HistoryFactRow[] | null;
  fetchedAt: string | null;
  /** `ready` quando a leitura com o servidor nesta tela deu certo. */
  status: 'loading' | 'ready' | 'offline' | 'error';
  reload: () => Promise<void>;
}

async function fetchHistory(engine: SyncEngine): Promise<CachedHistory> {
  const rows = await engine.runOnline((remote) => remote.readView<HistoryFactRow>('history_facts', HISTORY_COLUMNS, HISTORY_ORDER));
  const next = { rows, fetchedAt: new Date().toISOString() };
  if (!engine.store.hasBeenClosed()) await engine.store.setMeta(HISTORY_KEY, next);
  return next;
}

export function useHistory(): HistoryState {
  const engine = useSyncEngine();
  const { online } = useSyncState();
  const [cached, setCached] = useState<CachedHistory | null>(null);
  const [fetched, setFetched] = useState<'loading' | 'ready' | 'error'>('loading');

  // Cópia guardada primeiro (sem internet ela é o que há); com internet, lê de novo.
  useEffect(() => {
    let alive = true;
    void engine.store.getMeta<CachedHistory>(HISTORY_KEY).then((c) => {
      if (alive && c) setCached((prev) => prev ?? c);
    });
    if (online) {
      fetchHistory(engine).then(
        (next) => {
          if (!alive) return;
          setCached(next);
          setFetched('ready');
        },
        () => alive && setFetched('error'),
      );
    }
    return () => {
      alive = false;
    };
  }, [engine, online]);

  const reload = useCallback(async () => {
    setFetched('loading');
    try {
      const next = await fetchHistory(engine);
      setCached(next);
      setFetched('ready');
    } catch {
      setFetched('error');
    }
  }, [engine]);

  const status = fetched === 'ready' ? 'ready' : online ? fetched : 'offline';
  return { rows: cached?.rows ?? null, fetchedAt: cached?.fetchedAt ?? null, status, reload };
}

/** Nomes de funções e tipos vistos no histórico e na última planilha lida. */
export function historyLabels(rows: readonly HistoryFactRow[] | null, sheet: SheetLabels | undefined): SheetLabels {
  const roles: string[] = [...(sheet?.roles ?? [])];
  const types: string[] = [...(sheet?.types ?? [])];
  for (const r of rows ?? []) {
    if (r.job_role_name) roles.push(r.job_role_name);
    if (r.service_type_name) types.push(r.service_type_name);
  }
  return { roles, types };
}
