import type { Row } from '../sync/types';
import { useLocalQuery } from '../sync/SyncProvider';

export interface NotificationRow extends Row {
  person_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
}

/** A lista mostra os últimos 30 dias (US-022 EC-3). */
export const KEEP_DAYS = 30;

/** Avisos dos últimos 30 dias, do mais novo ao mais antigo. */
export function recentNotifications(rows: readonly NotificationRow[], now: Date): NotificationRow[] {
  const since = now.getTime() - KEEP_DAYS * 24 * 3_600_000;
  return rows.filter((n) => Date.parse(n.created_at) >= since).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Avisos da pessoa na cópia local; o Realtime e a leitura ao abrir mantêm a tabela em dia. */
export function useNotifications(): NotificationRow[] | undefined {
  return useLocalQuery((store) => store.mirror('notifications').toArray() as unknown as Promise<NotificationRow[]>, []);
}

/** Rota do app a partir do link do aviso (`#/minha-semana/...`, `#/evento/...`). */
export function linkPath(link: string | null): string {
  if (!link) return '/avisos';
  const hash = link.slice(link.indexOf('#') + 1);
  return hash.startsWith('/') ? hash : '/avisos';
}
