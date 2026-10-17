import { navigate } from '../router';
import { Button, Card } from '../ui/chiaro';
import { PageTitle } from './PageTitle';

/** Equipe abrindo tela de administrador (US-001 EC-9). */
export function NoPermission() {
  return (
    <section className="page">
      <PageTitle light="SEM" black="PERMISSÃO" />
      <Card style={{ maxWidth: 520 }}>
        <p className="form-text" style={{ marginTop: 0 }}>
          Esta tela é só para administradores. Se precisar dela, fale com o Planejamento.
        </p>
        <Button onClick={() => navigate('/minha-semana')}>Ir para minha semana</Button>
      </Card>
    </section>
  );
}
