import { useState, type FormEvent } from 'react';
import { OnlineButton } from '../sync/OnlineButton';
import { Input } from '../ui/chiaro';
import { AuthLayout } from './AuthLayout';
import { rateLimitMessage } from './LoginPage';
import { useSession } from './session';

/** Endereço do app com a rota de criar senha, para o link do e-mail voltar a ela. */
export function createPasswordUrl(): string {
  return `${window.location.origin}${window.location.pathname}#/criar-senha`;
}

export function ForgotPasswordPage() {
  const { remote } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    const result = await remote.requestPasswordReset(email.trim(), createPasswordUrl());
    setBusy(false);
    if (result.ok) setSent(true);
    else if (result.reason === 'rate_limited') setError(rateLimitMessage(result.retryAfterSeconds));
    else if (result.reason === 'offline') setError('Sem internet. Conecte o aparelho e tente de novo.');
    else setError('Não foi possível enviar o link agora. Tente de novo em instantes.');
  }

  return (
    <AuthLayout light="ESQUECI A" black="SENHA">
      {sent ? (
        <div className="form-stack">
          <p className="form-message" role="status">
            Se o e-mail estiver cadastrado, você vai receber um link para criar uma senha nova. Confira também a caixa de spam.
          </p>
          <a className="text-link" href="#/entrar">
            Voltar para o login
          </a>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit} noValidate>
          <p className="form-text">Informe o seu e-mail. Enviamos um link para você criar uma senha nova.</p>
          <Input
            label="E-mail"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p className="form-message form-message--alert" role="alert">
              {error}
            </p>
          )}
          <OnlineButton type="submit" fullWidth disabled={email.trim() === '' || busy}>
            {busy ? 'Enviando' : 'Enviar link'}
          </OnlineButton>
          <a className="text-link" href="#/entrar">
            Voltar para o login
          </a>
        </form>
      )}
    </AuthLayout>
  );
}
