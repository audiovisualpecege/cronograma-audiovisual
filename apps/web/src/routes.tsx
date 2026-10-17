// Tabela de rotas do app. As tarefas seguintes trocam os componentes provisórios pelas telas de verdade.
import { CreatePasswordPage } from './auth/CreatePasswordPage';
import { ForgotPasswordPage } from './auth/ForgotPasswordPage';
import { LoginPage } from './auth/LoginPage';
import { PageTitle } from './layout/PageTitle';
import type { RouteDef } from './router';

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

  { path: '/minha-semana', access: 'any', title: 'Minha semana', component: provisional('MINHA', 'SEMANA') },
  { path: '/minha-semana/:date', access: 'any', title: 'Minha semana', component: provisional('MINHA', 'SEMANA') },
  { path: '/equipe', access: 'any', title: 'Equipe', component: provisional('SEMANA DA', 'EQUIPE') },
  { path: '/avisos', access: 'any', title: 'Avisos', component: provisional(undefined, 'AVISOS') },
  { path: '/evento/:id', access: 'any', title: 'Evento', component: provisional(undefined, 'EVENTO') },

  { path: '/painel', access: 'admin', title: 'Painel', component: provisional('PAINEL DA', 'SEMANA') },
  { path: '/semana', access: 'admin', title: 'Semana', component: provisional('MONTAGEM DA', 'SEMANA') },
  { path: '/semana/:date', access: 'admin', title: 'Semana', component: provisional('MONTAGEM DA', 'SEMANA') },
  { path: '/admin/pessoas', access: 'admin', title: 'Pessoas', component: provisional(undefined, 'PESSOAS') },
  { path: '/admin/ausencias', access: 'admin', title: 'Ausências', component: provisional(undefined, 'AUSÊNCIAS') },
  { path: '/admin/funcoes', access: 'admin', title: 'Funções', component: provisional(undefined, 'FUNÇÕES') },
  { path: '/admin/setores', access: 'admin', title: 'Setores', component: provisional(undefined, 'SETORES') },
  { path: '/admin/tipos', access: 'admin', title: 'Tipos de serviço', component: provisional('TIPOS DE', 'SERVIÇO') },
  { path: '/admin/configuracao', access: 'admin', title: 'Configuração', component: provisional(undefined, 'CONFIGURAÇÃO') },
  { path: '/padroes', access: 'admin', title: 'Padrões', component: provisional(undefined, 'PADRÕES') },
  { path: '/importar', access: 'admin', title: 'Importar', component: provisional('IMPORTAR', 'HISTÓRICO') },
];
