import {
  BellIcon,
  CalendarIcon,
  CalendarMarkIcon,
  ChartSquareIcon,
  ClipboardListIcon,
  HomeIcon,
  SettingsIcon,
  UploadIcon,
  UserIdIcon,
  UsersGroupRoundedIcon,
  Widget2Icon,
  Folder2Icon,
} from '@solar-icons/react/linear';
import type { Icon } from '@solar-icons/react/lib/types';
import type { Profile } from '../supabase';

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
}

const TEAM: NavItem[] = [
  { to: '/minha-semana', label: 'Minha semana', icon: CalendarIcon },
  { to: '/equipe', label: 'Equipe', icon: UsersGroupRoundedIcon },
  { to: '/avisos', label: 'Avisos', icon: BellIcon },
];

const ADMIN: NavItem[] = [
  { to: '/painel', label: 'Painel', icon: HomeIcon },
  { to: '/semana', label: 'Semana', icon: CalendarIcon },
  { to: '/equipe', label: 'Equipe', icon: UsersGroupRoundedIcon },
  { to: '/avisos', label: 'Avisos', icon: BellIcon },
  { to: '/admin/pessoas', label: 'Pessoas', icon: UserIdIcon },
  { to: '/admin/ausencias', label: 'Ausências', icon: CalendarMarkIcon },
  { to: '/admin/funcoes', label: 'Funções', icon: ClipboardListIcon },
  { to: '/admin/setores', label: 'Setores', icon: Folder2Icon },
  { to: '/admin/tipos', label: 'Tipos de serviço', icon: Widget2Icon },
  { to: '/padroes', label: 'Padrões', icon: ChartSquareIcon },
  { to: '/importar', label: 'Importar', icon: UploadIcon },
  { to: '/admin/configuracao', label: 'Configuração', icon: SettingsIcon },
];

export function navItems(profile: Profile): NavItem[] {
  return profile === 'admin' ? ADMIN : TEAM;
}

/** Quantos itens cabem na barra inferior do celular antes do "Mais". */
export const BOTTOM_COUNT = 3;

export function isActive(item: NavItem, path: string): boolean {
  return path === item.to || path.startsWith(`${item.to}/`);
}
