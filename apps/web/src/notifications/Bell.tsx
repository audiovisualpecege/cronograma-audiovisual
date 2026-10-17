import { BellIcon } from '@solar-icons/react/linear';
import { useMemo, useState } from 'react';
import { Badge } from '../ui/chiaro';
import { Dialog } from '../ui/Dialog';
import { IconButton } from '../ui/IconButton';
import { useNow } from '../week/useWeek';
import { NotificationList } from './NotificationList';
import { recentNotifications, useNotifications } from './useNotifications';

/** Sino com contador de avisos não lidos; abre a lista num diálogo (US-022 AC-1). */
export function Bell() {
  const rows = useNotifications();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const unread = useMemo(() => recentNotifications(rows ?? [], now).filter((n) => !n.read_at).length, [rows, now]);
  const label = unread === 0 ? 'Avisos' : unread === 1 ? 'Avisos, 1 não lido' : `Avisos, ${unread} não lidos`;
  return (
    <span className="bell">
      <IconButton icon={BellIcon} label={label} onClick={() => setOpen(true)} aria-expanded={open} />
      {unread > 0 && (
        <span className="bell-count" aria-hidden="true">
          <Badge tone="warm">{unread > 99 ? '99+' : String(unread)}</Badge>
        </span>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Avisos">
        <NotificationList onOpen={() => setOpen(false)} />
      </Dialog>
    </span>
  );
}
