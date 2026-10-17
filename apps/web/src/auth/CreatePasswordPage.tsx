import { useState, type FormEvent } from 'react';
import { homeFor, navigate } from '../router';
import { OnlineButton } from '../sync/OnlineButton';
import { Input } from '../ui/chiaro';
import { AuthLayout } from './AuthLayout';
import { useSession } from './session';

export const MIN_PASSWORD = 8;

/** Senha nova pelo link do convite ou da redefinição (`#/criar-senha`). */
export function CreatePasswordPage() {
  const { state, remote, linkError } = useSession();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'loading') return null;
  if (state.status !== 'signed_in') {
    return (
      <AuthLayout light="CRIAR" black="SENHA">
        <div className="form-stack">
          <p className="form-message form-message--alert" role="alert">
            {linkError ?? 'Abra esta tela pelo link que chegou no seu e-mail.'}
          </p>
          <a className="text-link" href="#/esqueci-senha">
            Pedir um link novo
          </a>
          <a className="text-link" href="#/entrar">
            Voltar para o login
          </a>
        </div>
      </AuthLayout>
    );
  }

  const me = state.me;
  const tooShort = password.length < MIN_PASSWORD;
  const mismatch = repeat !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (tooShort || mismatch || busy) return;
    setBusy(true);
    setError(null);
    const result = await remote.updatePassword(password);
    setBusy(false);
    if (result.ok) navigate(homeFor(me.profile), { replace: true });
    else if (result.reason === 'invalid' && result.message === 'same_password') setError('A senha nova precisa ser diferente da anterior.');
    else if (result.reason === 'invalid') setError('Senha fraca. Use letras e números, com pelo menos 8 caracteres.');
    else if (result.reason === 'offline') setError('Sem internet. Conecte o aparelho e tente de novo.');
    else setError('Não foi possível salvar a senha agora. Tente de novo em instantes.');
  }

  return (
    <AuthLayout light="CRIAR" black="SENHA">
      <form className="form-stack" onSubmit={submit} noValidate>
        <p className="form-text">Olá, {me.name}. Crie a sua senha para entrar na plataforma.</p>
        <Input
          label="Senha nova"
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched(true)}
          hint={`Pelo menos ${MIN_PASSWORD} caracteres.`}
          error={touched && tooShort ? `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres` : undefined}
        />
        <Input
          label="Repita a senha"
          type="password"
          name="repeat-password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={touched && repeat !== '' && mismatch ? 'As senhas não conferem' : undefined}
        />
        {error && (
          <p className="form-message form-message--alert" role="alert">
            {error}
          </p>
        )}
        <OnlineButton type="submit" fullWidth disabled={busy || tooShort || mismatch}>
          {busy ? 'Salvando' : 'Salvar senha'}
        </OnlineButton>
      </form>
    </AuthLayout>
  );
}
