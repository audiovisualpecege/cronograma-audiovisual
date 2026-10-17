import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN_ME, FakeRemote, TEAM_ME } from '../test/fakeRemote';
import { setNetwork } from '../test/helpers';
import { App } from './App';

function goTo(hash: string) {
  window.history.replaceState(null, '', `/${hash}`);
}

async function login() {
  await userEvent.type(await screen.findByLabelText(/^E-mail/), 'pessoa@exemplo.test');
  await userEvent.type(screen.getByLabelText(/^Senha/), 'Senha-teste-123');
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

function signedIn(me = TEAM_ME) {
  const remote = new FakeRemote();
  remote.me = me;
  remote.storedSession = true;
  return remote;
}

describe('sessão e rotas por perfil', () => {
  it('UT-088 perfil Equipe em #/admin/pessoas vê "Sem permissão" e o botão "Ir para minha semana"', async () => {
    goTo('#/admin/pessoas');
    render(<App remote={signedIn(TEAM_ME)} />);
    expect(await screen.findByRole('heading', { name: 'SEM PERMISSÃO' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ir para minha semana' }));
    await waitFor(() => expect(window.location.hash).toBe('#/minha-semana'));
    expect(await screen.findByRole('heading', { name: 'MINHA SEMANA' })).toBeInTheDocument();
  });

  it('UT-089 rota #/evento/E1 sem sessão leva ao login e, depois de entrar, volta a #/evento/E1', async () => {
    goTo('#/evento/E1');
    const remote = new FakeRemote();
    remote.me = TEAM_ME;
    render(<App remote={remote} />);
    await waitFor(() => expect(window.location.hash).toBe('#/entrar?volta=%2Fevento%2FE1'));
    await login();
    await waitFor(() => expect(window.location.hash).toBe('#/evento/E1'));
    expect(await screen.findByRole('heading', { name: 'EVENTO' })).toBeInTheDocument();
  });

  it('UT-090 após entrar, Equipe vai para #/minha-semana e Administrador para #/painel', async () => {
    goTo('#/entrar');
    const team = new FakeRemote();
    team.me = TEAM_ME;
    const view = render(<App remote={team} />);
    await login();
    await waitFor(() => expect(window.location.hash).toBe('#/minha-semana'));
    view.unmount();
    localStorage.clear();

    goTo('#/entrar');
    const admin = new FakeRemote();
    admin.me = ADMIN_ME;
    render(<App remote={admin} />);
    await login();
    await waitFor(() => expect(window.location.hash).toBe('#/painel'));
    expect(await screen.findByRole('heading', { name: 'PAINEL DA SEMANA' })).toBeInTheDocument();
  });

  it('sessão salva entra direto, sem pedir a senha (US-001 AC-4)', async () => {
    goTo('');
    render(<App remote={signedIn(ADMIN_ME)} />);
    await waitFor(() => expect(window.location.hash).toBe('#/painel'));
  });

  it('sessão expirada no meio do uso pede login e volta à mesma tela (US-001 EC-5)', async () => {
    goTo('#/semana/2026-10-19');
    const remote = signedIn(ADMIN_ME);
    render(<App remote={remote} />);
    expect(await screen.findByRole('heading', { name: 'SEMANA DE 19/10' })).toBeInTheDocument();
    act(() => remote.expireSession());
    await waitFor(() => expect(window.location.hash).toBe('#/entrar?volta=%2Fsemana%2F2026-10-19'));
    expect(await screen.findByText(/Sua sessão terminou/)).toBeInTheDocument();
    await login();
    await waitFor(() => expect(window.location.hash).toBe('#/semana/2026-10-19'));
  });

  it('sem internet com sessão salva entra com o perfil guardado e mostra a faixa (US-001 EC-7)', async () => {
    goTo('');
    const first = signedIn(TEAM_ME);
    const view = render(<App remote={first} />);
    await waitFor(() => expect(window.location.hash).toBe('#/minha-semana'));
    view.unmount();

    setNetwork(false);
    const offline = signedIn(TEAM_ME);
    offline.offline = true;
    render(<App remote={offline} />);
    expect(await screen.findByRole('heading', { name: 'MINHA SEMANA' })).toBeInTheDocument();
    expect(screen.getByText(/^Sem internet/)).toBeInTheDocument();
  });

  it('link do e-mail #/criar-senha#access_token=... adota a sessão e abre a tela de criar senha', async () => {
    goTo('#/criar-senha#access_token=abc&refresh_token=def&type=recovery');
    const remote = new FakeRemote();
    remote.me = TEAM_ME;
    render(<App remote={remote} />);
    expect(await screen.findByLabelText(/^Senha nova/)).toBeInTheDocument();
    expect(window.location.hash).toBe('#/criar-senha');
    await userEvent.type(screen.getByLabelText(/^Senha nova/), 'Senha-nova-123');
    await userEvent.type(screen.getByLabelText(/^Repita a senha/), 'Senha-nova-123');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    await waitFor(() => expect(window.location.hash).toBe('#/minha-semana'));
  });

  it('link expirado mostra o que fazer', async () => {
    goTo('#/criar-senha#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
    render(<App remote={new FakeRemote()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('O link expirou ou já foi usado');
  });
});

describe('moldura de navegação', () => {
  it('menu lateral com os itens do perfil e a versão no rodapé', async () => {
    goTo('#/painel');
    render(<App remote={signedIn(ADMIN_ME)} />);
    const side = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(side).getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
    expect(within(side).getByRole('link', { name: 'Pessoas' })).toBeInTheDocument();
    expect(within(side).getByText('v1.0.0')).toBeInTheDocument();
  });

  it('Equipe não vê telas de administrador no menu', async () => {
    goTo('#/minha-semana');
    render(<App remote={signedIn(TEAM_ME)} />);
    const side = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(side).queryByRole('link', { name: 'Pessoas' })).toBeNull();
    expect(within(side).getByRole('link', { name: 'Minha semana' })).toBeInTheDocument();
  });

  it('barra inferior com "Mais", que traz o resto, Sair e a versão no fim', async () => {
    goTo('#/painel');
    render(<App remote={signedIn(ADMIN_ME)} />);
    const bottom = await screen.findByRole('navigation', { name: 'Menu do celular' });
    await userEvent.click(within(bottom).getByRole('button', { name: 'Mais' }));
    const more = screen.getByRole('dialog', { name: 'Mais' });
    expect(within(more).getByRole('link', { name: 'Configuração' })).toBeInTheDocument();
    const last = more.lastElementChild;
    expect(last).toHaveTextContent('v1.0.0');
    await userEvent.click(within(more).getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(window.location.hash).toBe('#/entrar?volta=%2Fpainel'));
  });
});
