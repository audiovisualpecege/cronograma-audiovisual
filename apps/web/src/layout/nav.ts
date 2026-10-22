import {
  BellIcon,
  CalendarAddIcon,
  CalendarIcon,
  CalendarMarkIcon,
  ChartSquareIcon,
  ClipboardListIcon,
  DatabaseIcon,
  HomeIcon,
  SettingsIcon,
  UploadIcon,
  UserIdIcon,
  UsersGroupRoundedIcon,
  Widget2Icon,
  Folder2Icon,
  TuningIcon,
  InfoCircleIcon,
  SettingsMinimalisticIcon,
} from '@solar-icons/react/linear';
import type { Icon } from '@solar-icons/react/lib/types';
import type { Profile } from '../supabase';

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
}

/** Grupo do menu com submenu (Dados, Configurações). */
export interface NavGroup {
  group: string;
  icon: Icon;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export const isGroup = (e: NavEntry): e is NavGroup => 'group' in e;

const TEAM: NavEntry[] = [
  { to: '/minha-semana', label: 'Minha semana', icon: CalendarIcon },
  { to: '/equipe', label: 'Equipe', icon: UsersGroupRoundedIcon },
  { to: '/avisos', label: 'Avisos', icon: BellIcon },
  { to: '/agenda-pessoal', label: 'Agenda pessoal', icon: CalendarAddIcon },
  { to: '/preferencias', label: 'Preferências', icon: TuningIcon },
  { to: '/sobre', label: 'Sobre', icon: InfoCircleIcon },
];

// Os avisos do administrador ficam numa aba do Painel e no sino do topo, fora do menu.
const ADMIN: NavEntry[] = [
  { to: '/painel', label: 'Painel', icon: HomeIcon },
  { to: '/semana', label: 'Semana', icon: CalendarIcon },
  { to: '/equipe', label: 'Equipe', icon: UsersGroupRoundedIcon },
  {
    group: 'Dados',
    icon: DatabaseIcon,
    items: [
      { to: '/admin/pessoas', label: 'Pessoas', icon: UserIdIcon },
      { to: '/admin/funcoes', label: 'Funções', icon: ClipboardListIcon },
      { to: '/admin/setores', label: 'Setores', icon: Folder2Icon },
      { to: '/admin/tipos', label: 'Tipos de serviço', icon: Widget2Icon },
      { to: '/admin/ausencias', label: 'Ausências', icon: CalendarMarkIcon },
      { to: '/padroes', label: 'Padrões', icon: ChartSquareIcon },
    ],
  },
  {
    group: 'Configurações',
    icon: SettingsIcon,
    items: [
      { to: '/admin/configuracao', label: 'Geral', icon: SettingsMinimalisticIcon },
      { to: '/importar', label: 'Importar', icon: UploadIcon },
      { to: '/agenda-pessoal', label: 'Agenda pessoal', icon: CalendarAddIcon },
      { to: '/preferencias', label: 'Preferências', icon: TuningIcon },
      { to: '/sobre', label: 'Sobre', icon: InfoCircleIcon },
    ],
  },
];

export function navEntries(profile: Profile): NavEntry[] {
  return profile === 'admin' ? ADMIN : TEAM;
}

/** Todas as telas do menu, sem os grupos. */
export function navItems(profile: Profile): NavItem[] {
  return navEntries(profile).flatMap((e) => (isGroup(e) ? e.items : [e]));
}

/** Quantos itens cabem na barra inferior do celular antes do "Mais". */
export const BOTTOM_COUNT = 3;

export function isActive(item: NavItem, path: string): boolean {
  return path === item.to || path.startsWith(`${item.to}/`);
}

export function groupActive(group: NavGroup, path: string): boolean {
  return group.items.some((i) => isActive(i, path));
}
