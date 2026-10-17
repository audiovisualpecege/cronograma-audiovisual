import type { ReactNode } from 'react';
import productIcon from '../assets/icon.svg';
import { Bell } from '../notifications/Bell';
import { PushReminder } from '../push/PushSettings';
import type { Me } from '../supabase';
import { ConflictDialog, PendingCount, RejectionToasts } from '../sync/ConflictDialog';
import { OfflineBanner } from '../sync/OfflineBanner';
import { BottomNav } from './BottomNav';
import { SideNav } from './SideNav';

/** Moldura das telas logadas: menu lateral no PC e Mac, barra inferior no celular, sino, faixas e conflitos. */
export function AppShell({ me, path, title, children }: { me: Me; path: string; title: string; children: ReactNode }) {
  return (
    <div className="shell">
      <SideNav me={me} path={path} />
      <div className="shell-body">
        <header className="top-bar">
          <img className="top-bar-icon" src={productIcon} alt="" width={28} height={28} />
          <span className="top-bar-title">{title}</span>
          <span className="top-bar-status">
            <PendingCount />
            <ConflictDialog />
            <Bell />
          </span>
        </header>
        <OfflineBanner />
        <PushReminder />
        <main className="shell-main">{children}</main>
      </div>
      <BottomNav me={me} path={path} />
      <RejectionToasts />
    </div>
  );
}
