import { CloseIcon, LogoutIcon } from '@solar-icons/react/linear';
import { useEffect } from 'react';
import { useSession } from '../auth/session';
import type { Me } from '../supabase';
import { AppIcon } from '../ui/AppIcon';
import { AppVersion } from '../ui/AppVersion';
import { IconButton } from '../ui/IconButton';
import { isActive, type NavItem } from './nav';

/** Menu "Mais" do celular: o resto das telas, Sair e a versão no fim. */
export function MoreMenu({ open, onClose, items, path, me }: { open: boolean; onClose: () => void; items: NavItem[]; path: string; me: Me }) {
  const { signOut } = useSession();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useEffect(() => {
    onClose();
    // Fecha ao trocar de tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  if (!open) return null;
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Mais" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-user">{me.name}</span>
          <IconButton icon={CloseIcon} label="Fechar" size={40} onClick={onClose} />
        </div>
        <ul className="sheet-list">
          {items.map((item) => (
            <li key={item.to}>
              <a className="nav-link" href={`#${item.to}`} aria-current={isActive(item, path) ? 'page' : undefined}>
                <AppIcon icon={item.icon} size={20} />
                <span>{item.label}</span>
              </a>
            </li>
          ))}
          <li>
            <button type="button" className="nav-link" onClick={() => void signOut()}>
              <AppIcon icon={LogoutIcon} size={20} />
              <span>Sair</span>
            </button>
          </li>
        </ul>
        <div className="sheet-footer">
          <AppVersion />
        </div>
      </div>
    </div>
  );
}
