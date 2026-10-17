import { useState, type FormEvent } from 'react';
import { Button, Input } from '../ui/chiaro';
import { useOnline } from '../sync/useOnline';
import type { SignInResult } from '../supabase';
import { AuthLayout } from './AuthLayout';
import { useSession, type SignedOutNotice } from './session';

export const FIRST_ACCESS_OFFLINE = 'O primeiro acesso precisa de internet';

/** Minutos para tentar de novo após o 429 do Auth; sem retry-after, a janela do limitador (5 min). */
export function rateLimitMessage(retryAfterSeconds?: number): string {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 300) / 60));
  return `Muitas tentativas; tente de novo em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

export function signInMessage(result: Extract<SignInResult, { ok: false }>): string {
  switch (result.reason) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos';
    case 'rate_limited':
      return rateLimitMessage(result.retryAfterSeconds);
    case 'disabled':
      return 'Acesso desativado; fale com o Planejamento';
    case 'offline':
      return FIRST_ACCESS_OFFLINE;
    default:
      return 'Não foi possível entrar agora. Tente de novo em instantes.';
  }
}

const NOTICES: Record<SignedOutNotice, string> = {
  expired: 'Sua sessão terminou. Entre de novo para continuar de onde parou.',
  disabled: 'Acesso desativado; fale com o Planejamento',
  password_created: 'Senha criada. Entre com a senha nova.',
};

export function LoginPage() {
  const { state, signIn } = useSession();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notice = state.status === 'signed_out' && state.notice ? NOTICES[state.notice] : null;
  const missingEmail = email.trim() === '';
  const missingPassword = password === '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (missingEmail || missingPassword || busy) return;
    if (!online) {
      setError(FIRST_ACCESS_OFFLINE);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (!result.ok) setError(signInMessage(result));
  }

  return (
    <AuthLayout light="CRONOGRAMA" black="AUDIOVISUAL">
      <form className="form-stack" onSubmit={submit} noValidate>
        {!online && (
          <p className="form-message form-message--alert" role="alert">
            {FIRST_ACCESS_OFFLINE}. Conecte o aparelho e tente de novo.
          </p>
        )}
        {notice && !error && <p className="form-message" role="status">{notice}</p>}
        <Input
          label="E-mail"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setTouched(true);
          }}
          onBlur={() => setTouched(true)}
          error={touched && missingEmail ? 'Informe o e-mail' : undefined}
          aria-invalid={touched && missingEmail ? true : undefined}
        />
        <Input
          label="Senha"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setTouched(true);
          }}
          error={touched && missingPassword ? 'Informe a senha' : undefined}
          aria-invalid={touched && missingPassword ? true : undefined}
        />
        {error && (
          <p className="form-message form-message--alert" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" fullWidth disabled={missingEmail || missingPassword || busy || !online}>
          {busy ? 'Entrando' : 'Entrar'}
        </Button>
        <a className="text-link" href="#/esqueci-senha">
          Esqueci a senha
        </a>
      </form>
    </AuthLayout>
  );
}
