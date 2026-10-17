import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeRemote, fakeFetch, json, memoryStorage, tokenResponse } from '../../test/fakeRemote';
import { setNetwork } from '../../test/helpers';
import { App } from '../App';
import { createSupabaseRemote } from '../supabase';

const USER = 'e0000000-0000-4000-8000-000000000010';

/** App com o supabase-js de verdade e só o `fetch` falso. */
function realRemote(auth: () => Response, people: unknown[] = []) {
  const fetch = fakeFetch((req) => {
    const url = new URL(req.url);
    if (url.pathname === '/auth/v1/token') return auth();
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (url.pathname === '/rest/v1/people') return json(people);
    return json({ message: 'não esperado' }, 404);
  });
  return { fetch, remote: createSupabaseRemote({ url: 'http://supabase.test', key: 'chave-publica', fetch, storage: memoryStorage() }) };
}

async function fillAndSubmit(email = 'pessoa10@exemplo.test', password = 'senha-errada') {
  await userEvent.type(await screen.findByLabelText(/^E-mail/), email);
  await userEvent.type(screen.getByLabelText(/^Senha/), password);
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('login', () => {
  it('UT-083 LoginForm com campos vazios desabilita "Entrar" e marca o campo que falta', async () => {
    render(<App remote={new FakeRemote()} />);
    const entrar = await screen.findByRole('button', { name: 'Entrar' });
    expect(entrar).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^E-mail/), 'pessoa10@exemplo.test');
    expect(entrar).toBeDisabled();
    expect(screen.getByLabelText(/^Senha/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Informe a senha')).toBeInTheDocument();
    expect(screen.getByLabelText(/^E-mail/)).not.toHaveAttribute('aria-invalid');

    await userEvent.clear(screen.getByLabelText(/^E-mail/));
    await userEvent.type(screen.getByLabelText(/^Senha/), 'x');
    expect(entrar).toBeDisabled();
    expect(screen.getByText('Informe o e-mail')).toBeInTheDocument();
  });

  it('UT-084 resposta invalid_credentials mostra "E-mail ou senha incorretos"', async () => {
    const { remote } = realRemote(() => json({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400));
    render(<App remote={remote} />);
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^E-mail ou senha incorretos$/);
  });

  it('UT-085 resposta 429 com retry-after: 300 mostra "Muitas tentativas; tente de novo em 5 minutos"', async () => {
    const { remote } = realRemote(() =>
      json({ code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, 429, { 'retry-after': '300' }),
    );
    render(<App remote={remote} />);
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Muitas tentativas; tente de novo em 5 minutos$/);
  });

  it('UT-086 pessoa inativa ou usuário banido mostra "Acesso desativado; fale com o Planejamento"', async () => {
    const banned = realRemote(() => json({ code: 'user_banned', error_code: 'user_banned', msg: 'User is banned' }, 400));
    const view = render(<App remote={banned.remote} />);
    await fillAndSubmit('pessoa10@exemplo.test', 'Senha-teste-123');
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Acesso desativado; fale com o Planejamento$/);
    view.unmount();

    // Conta do Auth ainda ativa, mas a pessoa foi desativada: a RLS não devolve o cadastro.
    const inactive = realRemote(() => json(tokenResponse(USER, 'pessoa10@exemplo.test')), []);
    render(<App remote={inactive.remote} />);
    await fillAndSubmit('pessoa10@exemplo.test', 'Senha-teste-123');
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Acesso desativado; fale com o Planejamento$/);
    expect(inactive.fetch.calls.some((r) => new URL(r.url).pathname === '/auth/v1/logout')).toBe(true);
    expect(window.location.hash).toBe('#/entrar');
  });

  it('UT-087 sem rede e sem sessão salva mostra "O primeiro acesso precisa de internet"', async () => {
    setNetwork(false);
    const remote = new FakeRemote();
    remote.offline = true;
    render(<App remote={remote} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('O primeiro acesso precisa de internet');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  it('o rodapé do login traz a assinatura da Chiaro e a versão', async () => {
    render(<App remote={new FakeRemote()} />);
    expect(await screen.findByText('um produto')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Chiaro Filmes' })).toHaveAttribute('src', expect.stringContaining('chiaro-filmes-horizontal-white'));
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('"Esqueci a senha" pede o link com a volta para #/criar-senha', async () => {
    const remote = new FakeRemote();
    render(<App remote={remote} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Esqueci a senha' }));
    await userEvent.type(await screen.findByLabelText(/^E-mail/), 'pessoa10@exemplo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByText(/você vai receber um link/)).toBeInTheDocument();
    expect(remote.resetCalls).toEqual([{ email: 'pessoa10@exemplo.test', redirectTo: expect.stringMatching(/#\/criar-senha$/) }]);
  });
});
