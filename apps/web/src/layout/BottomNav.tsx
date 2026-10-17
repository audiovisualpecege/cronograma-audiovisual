import { MenuDotsIcon } from '@solar-icons/react/linear';
import { useState } from 'react';
import type { Me } from '../supabase';
import { AppIcon } from '../ui/AppIcon';
import { BOTTOM_COUNT, isActive, navItems } from './nav';
import { MoreMenu } from './MoreMenu';

/** Barra inferior do celular: as telas mais usadas e o "Mais" com o resto. */
export function BottomNav({ me, path }: { me: Me; path: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const items = navItems(me.profile);
  const main = items.slice(0, BOTTOM_COUNT);
  const rest = items.slice(BOTTOM_COUNT);
  const restActive = rest.some((i) => isActive(i, path));
  return (
    <>
      <nav className="bottom-nav" aria-label="Menu do celular">
        {main.map((item) => (
          <a key={item.to} className="bottom-nav-link" href={`#${item.to}`} aria-current={isActive(item, path) ? 'page' : undefined}>
            <AppIcon icon={item.icon} size={24} />
            <span>{item.label}</span>
          </a>
        ))}
        <button
          type="button"
          className="bottom-nav-link"
          aria-expanded={moreOpen}
          aria-current={restActive ? 'page' : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <AppIcon icon={MenuDotsIcon} size={24} />
          <span>Mais</span>
        </button>
      </nav>
      <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} items={rest} path={path} me={me} />
    </>
  );
}
