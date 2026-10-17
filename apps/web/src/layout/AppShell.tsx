import type { ReactNode } from 'react';
import productIcon from '../assets/icon.svg';
import type { Me } from '../supabase';
import { ConflictDialog, PendingCount, RejectionToasts } from '../sync/ConflictDialog';
import { OfflineBanner } from '../sync/OfflineBanner';
import { BottomNav } from './BottomNav';
import { SideNav } from './SideNav';

/** Moldura das telas logadas: menu lateral no PC e Mac, barra inferior no celular, faixas e conflitos. */
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
          </span>
        </header>
        <OfflineBanner />
        <main className="shell-main">{children}</main>
      </div>
      <BottomNav me={me} path={path} />
      <RejectionToasts />
    </div>
  );
}
