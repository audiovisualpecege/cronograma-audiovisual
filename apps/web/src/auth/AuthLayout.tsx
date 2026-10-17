import type { ReactNode } from 'react';
import logoChiaro from '@chiaro/assets/logos/chiaro-filmes-horizontal-white.png';
import productIcon from '../assets/icon.svg';
import { AppVersion } from '../ui/AppVersion';
import { Card } from '../ui/chiaro';

/** Moldura das telas de acesso: ícone do produto, título, cartão e a assinatura da Chiaro com a versão. */
export function AuthLayout({ light, black, children }: { light: string; black: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-main">
        <img className="auth-icon" src={productIcon} alt="" width={64} height={64} />
        <h1 className="screen-title auth-title">
          <span className="screen-title-light">{light}</span> <span className="screen-title-black">{black}</span>
        </h1>
        <Card padding="var(--space-6)" style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box' }}>
          {children}
        </Card>
      </main>
      <footer className="auth-footer">
        <span className="auth-signature">
          <span>um produto</span>
          <img src={logoChiaro} alt="Chiaro Filmes" height={18} />
        </span>
        <AppVersion />
      </footer>
    </div>
  );
}
