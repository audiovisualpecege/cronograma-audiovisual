import { useEffect, useState } from 'react';
import { Button, Card } from '../ui/chiaro';
import { browserKind, clearInstallPrompt, installPrompt, isStandalone, onInstallPrompt, type BrowserKind } from './platform';

/** Nota das notificações no iPhone (US-021 AC-3). */
export const IOS_PUSH_NOTE = 'No iPhone, as notificações só funcionam com o app instalado na tela inicial, no iOS 16.4 ou mais novo.';

const STEPS: Record<BrowserKind, string[]> = {
  ios: [
    'Abra este endereço no Safari.',
    'Toque no botão Compartilhar, o quadrado com a seta para cima, na barra de baixo.',
    'Role a lista e toque em Adicionar à Tela de Início.',
    'Toque em Adicionar. Depois, abra o Cronograma Audiovisual pelo ícone novo na tela inicial.',
  ],
  'firefox-android': [
    'No Firefox, toque no menu de três pontos ao lado do endereço.',
    'Toque em Instalar ou em Adicionar à tela inicial.',
    'Confirme em Adicionar. O ícone do Cronograma Audiovisual aparece na tela inicial.',
  ],
  samsung: [
    'No Samsung Internet, toque no menu de três linhas na barra de baixo.',
    'Toque em Adicionar página a, depois em Tela inicial.',
    'Confirme em Adicionar.',
  ],
  android: [
    'No Chrome, toque no menu de três pontos ao lado do endereço.',
    'Toque em Instalar app ou em Adicionar à tela inicial.',
    'Confirme em Instalar. O app abre em tela cheia pelo ícone novo.',
  ],
  desktop: [
    'No Chrome ou no Edge, clique no ícone de instalar no fim da barra de endereço.',
    'Confirme em Instalar. No Windows e no Mac, também há o programa instalado pela pasta da rede.',
  ],
};

/** Instrução "Instalar no celular" do navegador em uso; some quando o app já está instalado (US-021 EC-2). */
export function InstallHelp() {
  const [prompt, setPrompt] = useState(() => installPrompt());
  const [installed, setInstalled] = useState(() => isStandalone());
  useEffect(() => onInstallPrompt(() => setPrompt(installPrompt())), []);
  if (installed) return null;
  const kind = browserKind();

  async function install() {
    const p = installPrompt();
    if (!p) return;
    await p.prompt();
    const choice = await p.userChoice;
    clearInstallPrompt();
    if (choice.outcome === 'accepted') setInstalled(true);
  }

  return (
    <Card variant="raised" padding={20}>
      <section aria-labelledby="install-title" className="form-stack">
        <h2 id="install-title" className="section-title">
          Instalar no celular
        </h2>
        <p className="form-text">Com o app instalado, a plataforma abre em tela cheia com um toque e funciona sem internet com a última cópia.</p>
        {prompt ? (
          <Button size="sm" onClick={() => void install()}>
            Instalar o app
          </Button>
        ) : (
          <ol className="install-steps" aria-label="Passo a passo">
            {STEPS[kind].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {kind === 'ios' && (
          <p className="form-text" role="note">
            {IOS_PUSH_NOTE}
          </p>
        )}
      </section>
    </Card>
  );
}
