// Tabela de rotas do app. As tarefas seguintes trocam os componentes provisórios pelas telas de verdade.
import { CreatePasswordPage } from './auth/CreatePasswordPage';
import { ForgotPasswordPage } from './auth/ForgotPasswordPage';
import { LoginPage } from './auth/LoginPage';
import { AbsencesPage } from './admin/absences/AbsencesPage';
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
  { path: '/evento/:id', access: 'any', title: 'Evento', component: provisional(undefined, 'EVENTO') },

  { path: '/painel', access: 'admin', title: 'Painel', component: provisional('PAINEL DA', 'SEMANA') },
  { path: '/semana', access: 'admin', title: 'Semana', component: provisional('MONTAGEM DA', 'SEMANA') },
  { path: '/semana/:date', access: 'admin', title: 'Semana', component: provisional('MONTAGEM DA', 'SEMANA') },
  { path: '/admin/pessoas', access: 'admin', title: 'Pessoas', component: PeoplePage },
  { path: '/admin/ausencias', access: 'admin', title: 'Ausências', component: AbsencesPage },
  { path: '/admin/funcoes', access: 'admin', title: 'Funções', component: RolesPage },
  { path: '/admin/setores', access: 'admin', title: 'Setores', component: SectorsPage },
  { path: '/admin/tipos', access: 'admin', title: 'Tipos de serviço', component: ServiceTypesPage },
  { path: '/admin/configuracao', access: 'admin', title: 'Configuração', component: SettingsPage },
  { path: '/padroes', access: 'admin', title: 'Padrões', component: PatternsPage },
  { path: '/importar', access: 'admin', title: 'Importar', component: () => <ImportPage /> },
];
