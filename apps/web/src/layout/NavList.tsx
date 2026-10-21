import { AltArrowDownIcon } from '@solar-icons/react/linear';
import { useState } from 'react';
import { AppIcon } from '../ui/AppIcon';
import { groupActive, isActive, isGroup, type NavEntry, type NavGroup, type NavItem } from './nav';

function NavLink({ item, path }: { item: NavItem; path: string }) {
  return (
    <a className="nav-link" href={`#${item.to}`} aria-current={isActive(item, path) ? 'page' : undefined}>
      <AppIcon icon={item.icon} size={20} />
      <span>{item.label}</span>
    </a>
  );
}

/** Grupo com submenu: abre e fecha no clique; começa aberto quando a tela atual está nele. */
function NavGroupView({ group, path }: { group: NavGroup; path: string }) {
  const active = groupActive(group, path);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? active;
  const id = `nav-${group.group.toLowerCase()}`;
  return (
    <>
      <button
        type="button"
        className={`nav-link nav-group-toggle${active ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setToggled(!open)}
      >
        <AppIcon icon={group.icon} size={20} />
        <span>{group.group}</span>
        <span className={`nav-group-arrow${open ? ' is-open' : ''}`}>
          <AppIcon icon={AltArrowDownIcon} size={16} />
        </span>
      </button>
      {open && (
        <ul className="nav-sublist" id={id} aria-label={group.group}>
          {group.items.map((item) => (
            <li key={item.to}>
              <NavLink item={item} path={path} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Itens do menu, com os grupos Dados e Configurações em submenu. */
export function NavList({ entries, path }: { entries: readonly NavEntry[]; path: string }) {
  return (
    <>
      {entries.map((e) => (
        <li key={isGroup(e) ? e.group : e.to}>{isGroup(e) ? <NavGroupView group={e} path={path} /> : <NavLink item={e} path={path} />}</li>
      ))}
    </>
  );
}
