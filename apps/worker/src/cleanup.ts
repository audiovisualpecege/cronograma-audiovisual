// Limpeza dos avisos: a lista mostra os 30 dias mais recentes (US-022 EC-3); o resto sai da tabela.
import type { CleanupStore } from './store.ts';

export const NOTIFICATION_DAYS = 30;

export async function cleanupNotifications(store: CleanupStore, now: Date): Promise<number> {
  return store.deleteNotificationsBefore(new Date(now.getTime() - NOTIFICATION_DAYS * 86_400_000));
}
