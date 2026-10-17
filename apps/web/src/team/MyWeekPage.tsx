import { PageTitle } from '../layout/PageTitle';

/** "Minha semana": por enquanto só o título, para o convite aceito chegar numa tela. O conteúdo vem na tarefa 8. */
export function MyWeekPage() {
  return (
    <section className="page">
      <PageTitle light="MINHA" black="SEMANA" />
    </section>
  );
}
