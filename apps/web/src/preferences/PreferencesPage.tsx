import { InstallHelp } from '../install/InstallHelp';
import { PageTitle } from '../layout/PageTitle';
import { PushSettings } from '../push/PushSettings';
import { Card } from '../ui/chiaro';

/** Preferências pessoais: notificações deste aparelho, agenda pessoal e instalação (PRD, Permissões). */
export function PreferencesPage() {
  return (
    <section className="page preferences-page">
      <PageTitle black="PREFERÊNCIAS" />
      <div className="card-grid">
        <PushSettings />
        <Card variant="raised" padding={20}>
          <section aria-labelledby="agenda-pessoal-title" className="form-stack">
            <h2 id="agenda-pessoal-title" className="section-title">
              Minha agenda no meu calendário
            </h2>
            <p className="form-text">Assine as suas atividades publicadas no Google Agenda, no calendário do iPhone ou no Outlook.</p>
            <a className="text-link" href="#/agenda-pessoal">
              Abrir a agenda pessoal
            </a>
          </section>
        </Card>
        <InstallHelp />
      </div>
    </section>
  );
}
