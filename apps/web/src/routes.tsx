// Tabela de rotas do app: quem pode abrir cada tela.
import { CreatePasswordPage } from './auth/CreatePasswordPage';
import { ForgotPasswordPage } from './auth/ForgotPasswordPage';
import { LoginPage } from './auth/LoginPage';
import { AbsencesPage } from './admin/absences/AbsencesPage';
import { DashboardPage } from './admin/dashboard/DashboardPage';
import { PeoplePage } from './admin/people/PeoplePage';
import { RolesPage } from './admin/roles/RolesPage';
import { SectorsPage } from './admin/sectors/SectorsPage';
import { ServiceTypesPage } from './admin/serviceTypes/ServiceTypesPage';
import { ImportPage } from './import/ImportPage';
import { PatternsPage } from './patterns/PatternsPage';
import type { RouteDef } from './router';
import { SettingsPage } from './settings/SettingsPage';
import { MyWeekPage } from './team/MyWeekPage';
import { TeamPage } from './team/TeamPage';
import { NotificationsPage } from './notifications/NotificationsPage';
import { PreferencesPage } from './preferences/PreferencesPage';
import { IcalPage } from './ical/IcalPage';
import { EventPage } from './event/EventPage';
import { WeekPage } from './week/WeekPage';
import { AboutPage } from './about/AboutPage';

export const ROUTES: readonly RouteDef[] = [
  { path: '/entrar', access: 'public', title: 'Entrar', component: LoginPage },
  { path: '/esqueci-senha', access: 'public', title: 'Esqueci a senha', component: ForgotPasswordPage },
  { path: '/criar-senha', access: 'public', title: 'Criar senha', component: CreatePasswordPage },

  { path: '/minha-semana', access: 'any', title: 'Minha semana', component: MyWeekPage },
  { path: '/minha-semana/:date', access: 'any', title: 'Minha semana', component: MyWeekPage },
  { path: '/equipe', access: 'any', title: 'Equipe', component: TeamPage },
  { path: '/equipe/:date', access: 'any', title: 'Equipe', component: TeamPage },
  { path: '/avisos', access: 'any', title: 'Avisos', component: NotificationsPage },
  { path: '/preferencias', access: 'any', title: 'Preferências', component: PreferencesPage },
  { path: '/agenda-pessoal', access: 'any', title: 'Agenda pessoal', component: IcalPage },
  { path: '/evento/:id', access: 'any', title: 'Evento', component: EventPage },
  { path: '/sobre', access: 'any', title: 'Sobre', component: () => <AboutPage /> },

  { path: '/painel', access: 'admin', title: 'Painel', component: DashboardPage },
  { path: '/semana', access: 'admin', title: 'Semana', component: WeekPage },
  { path: '/semana/:date', access: 'admin', title: 'Semana', component: WeekPage },
  { path: '/admin/pessoas', access: 'admin', title: 'Pessoas', component: PeoplePage },
  { path: '/admin/ausencias', access: 'admin', title: 'Ausências', component: AbsencesPage },
  { path: '/admin/funcoes', access: 'admin', title: 'Funções', component: RolesPage },
  { path: '/admin/setores', access: 'admin', title: 'Setores', component: SectorsPage },
  { path: '/admin/tipos', access: 'admin', title: 'Tipos de serviço', component: ServiceTypesPage },
  { path: '/admin/configuracao', access: 'admin', title: 'Configuração', component: SettingsPage },
  { path: '/padroes', access: 'admin', title: 'Padrões', component: PatternsPage },
  { path: '/importar', access: 'admin', title: 'Importar', component: () => <ImportPage /> },
];
