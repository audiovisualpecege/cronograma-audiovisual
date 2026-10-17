import { useMemo } from 'react';
import { navigate } from '../router';
import { useSyncEngine } from '../sync/SyncProvider';
import { Button } from '../ui/chiaro';
import { formatStamp } from '../ui/format';
import { Seal } from '../week/Seal';
import { useNow } from '../week/useWeek';
import { linkPath, recentNotifications, useNotifications, type NotificationRow } from './useNotifications';

/** Lista de avisos: tocar abre a atividade e marca lido; "Marcar todos como lidos" (US-022). */
export function NotificationList({ onOpen }: { onOpen?: () => void }) {
  const engine = useSyncEngine();
  const rows = useNotifications();
  const now = useNow();
  const list = useMemo(() => recentNotifications(rows ?? [], now), [rows, now]);
  const unread = list.filter((n) => !n.read_at);

  function open(n: NotificationRow) {
    if (!n.read_at) void engine.markNotificationsRead([n.id]);
    onOpen?.();
    navigate(linkPath(n.link));
  }

  if (!rows) return <p className="form-text">Abrindo os avisos.</p>;
  return (
    <div className="notification-list">
      <div className="notification-head">
        <span className="list-count">{unread.length === 0 ? 'Nenhum aviso novo' : unread.length === 1 ? '1 aviso novo' : `${unread.length} avisos novos`}</span>
        {unread.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void engine.markNotificationsRead(unread.map((n) => n.id))}>
            Marcar todos como lidos
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="form-text">Sem avisos nos últimos 30 dias.</p>
      ) : (
        <ul className="plain-list notification-items" aria-label="Avisos">
          {list.map((n) => (
            <li key={n.id}>
              <button type="button" className={n.read_at ? 'notification-item' : 'notification-item is-unread'} onClick={() => open(n)}>
                <span className="notification-title">
                  {n.title}
                  {!n.read_at && <Seal kind="hoje">novo</Seal>}
                </span>
                {n.body && <span className="notification-body">{n.body}</span>}
                <span className="notification-time">{formatStamp(n.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
