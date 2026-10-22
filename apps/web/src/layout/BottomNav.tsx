import { MenuDotsIcon } from '@solar-icons/react/linear';
import { useState } from 'react';
import type { Me } from '../supabase';
import { AppIcon } from '../ui/AppIcon';
import { BOTTOM_COUNT, groupActive, isActive, isGroup, navEntries, type NavItem } from './nav';
import { MoreMenu } from './MoreMenu';

/** Barra inferior do celular: as telas mais usadas e o "Mais" com o resto. */
export function BottomNav({ me, path }: { me: Me; path: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const entries = navEntries(me.profile);
  // As primeiras telas soltas vão na barra; o resto (com os grupos) vai no "Mais".
  const main = entries.slice(0, BOTTOM_COUNT).filter((e): e is NavItem => !isGroup(e));
  const rest = entries.slice(main.length);
  const restActive = rest.some((e) => (isGroup(e) ? groupActive(e, path) : isActive(e, path)));
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
      <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} entries={rest} path={path} me={me} />
    </>
  );
}
