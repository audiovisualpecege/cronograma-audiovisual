// Pedidos ao serviço de fundo vistos pela cópia local (tabela jobs, avisada pelo Realtime).
import { useEffect } from 'react';
import type { JobRow, SettingsRow } from '../data/catalog';
import { useLocalQuery, useSyncEngine } from '../sync/SyncProvider';
import type { TableName } from '../sync/types';

export function useJob(id: string | null): JobRow | undefined {
  return useLocalQuery(
    async (store) => (id ? ((await store.mirror('jobs').get(id)) as JobRow | undefined) : undefined),
    [id],
  );
}

export const isFinished = (job: JobRow | undefined) => job?.status === 'done' || job?.status === 'failed';

/** Quando o pedido termina, lê de novo as tabelas que o serviço de fundo gravou. */
export function useRefreshWhenFinished(job: JobRow | undefined, tables: TableName[]) {
  const engine = useSyncEngine();
  const finished = isFinished(job);
  const key = tables.join(',');
  useEffect(() => {
    if (!finished) return;
    for (const t of key.split(',')) void engine.pull(t as TableName).catch(() => undefined);
  }, [finished, engine, key]);
}

export function useSettings(): SettingsRow | undefined {
  return useLocalQuery(async (store) => (await store.mirror('settings').toArray())[0] as SettingsRow | undefined, []);
}
