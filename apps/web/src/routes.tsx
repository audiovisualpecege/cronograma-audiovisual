// Tabela de rotas do app. As tarefas seguintes trocam os componentes provisórios pelas telas de verdade.
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
import { PageTitle } from './layout/PageTitle';
import { PatternsPage } from './patterns/PatternsPage';
import type { RouteDef } from './router';
import { SettingsPage } from './settings/SettingsPage';
import { MyWeekPage } from './team/MyWeekPage';
import { EventPage } from './event/EventPage';
import { WeekPage } from './week/WeekPage';

function provisional(light: string | undefined, black: string) {
  return function ProvisionalPage() {
    return (
      <section className="page">
        <PageTitle light={light} black={black} />
        <p className="form-text">Em preparação.</p>
      </section>
    );
  };
}

export const ROUTES: readonly RouteDef[] = [
  { path: '/entrar', access: 'public', title: 'Entrar', component: LoginPage },
  { path: '/esqueci-senha', access: 'public', title: 'Esqueci a senha', component: ForgotPasswordPage },
  { path: '/criar-senha', access: 'public', title: 'Criar senha', component: CreatePasswordPage },

  { path: '/minha-semana', access: 'any', title: 'Minha semana', component: MyWeekPage },
  { path: '/minha-semana/:date', access: 'any', title: 'Minha semana', component: MyWeekPage },
  { path: '/equipe', access: 'any', title: 'Equipe', component: provisional('SEMANA DA', 'EQUIPE') },
  { path: '/avisos', access: 'any', title: 'Avisos', component: provisional(undefined, 'AVISOS') },
  { path: '/evento/:id', access: 'any', title: 'Evento', component: EventPage },

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
