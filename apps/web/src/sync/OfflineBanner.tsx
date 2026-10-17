import { CloudCrossIcon, DangerTriangleIcon } from '@solar-icons/react/linear';
import { useEffect, useState } from 'react';
import { AppIcon } from '../ui/AppIcon';
import { formatStamp } from '../ui/format';
import { useSyncState } from './SyncProvider';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BannerInfo {
  tone: 'info' | 'alert';
  text: string;
}

/** Faixa sem internet: informativa até 24 h desde a última atualização, alerta depois (US-025 EC-2). */
export function offlineBanner(online: boolean, lastSyncAt: string | null, now: Date): BannerInfo | null {
  if (online) return null;
  if (!lastSyncAt) return { tone: 'alert', text: 'Sem internet. Este aparelho ainda não tem cópia dos dados.' };
  const age = now.getTime() - Date.parse(lastSyncAt);
  return { tone: age > DAY_MS ? 'alert' : 'info', text: `Sem internet, atualizado em ${formatStamp(lastSyncAt)}` };
}

export function OfflineBanner() {
  const { online, lastSyncAt } = useSyncState();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const banner = offlineBanner(online, lastSyncAt, now);
  if (!banner) return null;
  return (
    <div role="status" className={`offline-banner offline-banner--${banner.tone}`} data-tone={banner.tone}>
      <AppIcon icon={banner.tone === 'alert' ? DangerTriangleIcon : CloudCrossIcon} size={20} />
      <span>{banner.text}</span>
    </div>
  );
}
