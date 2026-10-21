import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { row, SETTINGS } from '../../test/catalogRows';
import { FakeRemote } from '../../test/fakeRemote';
import { renderWithSync } from '../../test/helpers';
import { FREE_PLAN_NOTICE, LOCAL_NOTICE } from './AiSettings';
import { SettingsPage } from './SettingsPage';

const KEY = 'AIzaSyD-chave-secreta-de-teste-a1b2';

function remoteWith(settings = SETTINGS) {
  const remote = new FakeRemote();
  remote.rows = {
    settings: [settings],
    calendar_sources: [
      row('cs-1', { google_calendar_id: 'pecegeworks@gmail.com', label: 'pecegeworks', enabled: true, status: 'connected', last_synced_at: '2026-10-21T14:45:00.000Z', last_error: null }),
    ],
    jobs: [],
  };
  return remote;
}

describe('SettingsPage: IA local', () => {
  it('com o modelo local, pede endereço e modelo em vez da chave e grava pelo settings.update', async () => {
    const user = userEvent.setup();
    const remote = remoteWith({ ...SETTINGS, ai_provider: 'local', ai_local_url: null, ai_local_model: 'minicpm5' });
    renderWithSync(<SettingsPage />, { remote });
    expect(await screen.findByText(LOCAL_NOTICE)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Chave da API|Trocar a chave/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Testar conexão' })).toBeDisabled();

    const url = screen.getByLabelText(/^Endereço do servidor/);
    await user.type(url, 'nas:11434');
    await user.tab();
    expect(await screen.findByText(/Comece com http:\/\/ ou https:\/\//)).toBeInTheDocument();
    await user.clear(url);
    await user.type(url, 'http://172.16.52.30:11434');
    await user.tab();
    await waitFor(() =>
      expect(remote.applyCalls.flat().find((o) => o.kind === 'settings.update')).toMatchObject({ payload: { ai_local_url: 'http://172.16.52.30:11434' } }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Testar conexão' })).toBeEnabled());
  });
});

describe('SettingsPage', () => {
  it('UT-112 configuração da IA mostra só ai_key_hint ("...a1b2"), nunca a chave', async () => {
    const user = userEvent.setup();
    const remote = remoteWith();
    remote.rpcHandler = (fn) => {
      if (fn !== 'set_ai_key') return {};
      remote.rows.jobs = [row('job-1', { kind: 'test_ai_key', status: 'queued', payload: {}, result: null, error: null, created_at: '2026-10-16T12:00:00.000Z' })];
      return { hint: '...a1b2' };
    };
    const { container } = renderWithSync(<SettingsPage />, { remote });
    expect(await screen.findByText('...a1b2')).toBeInTheDocument();

    const field = screen.getByLabelText(/^Trocar a chave/);
    expect(field).toHaveAttribute('type', 'password');
    await user.type(field, KEY);
    await user.click(screen.getByRole('button', { name: 'Salvar e testar' }));

    await waitFor(() => expect(remote.rpcCalls).toEqual([{ fn: 'set_ai_key', args: { provider: 'gemini', key: KEY } }]));
    await waitFor(() => expect(field).toHaveValue(''));
    expect(await screen.findByText('Testando a chave com o fornecedor.')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(KEY);
    expect(container.innerHTML).not.toContain('chave-secreta');

    // O worker recusa a chave: a mensagem dele aparece e a anterior continua.
    remote.rows.jobs = [row('job-1', { kind: 'test_ai_key', status: 'failed', payload: {}, result: null, error: 'Chave recusada pelo fornecedor', created_at: '2026-10-16T12:00:00.000Z', updated_at: '2026-10-16T12:00:05.000Z' })];
    remote.emit('jobs');
    expect(await screen.findByRole('alert')).toHaveTextContent('Chave recusada pelo fornecedor. A configuração anterior continua valendo.');
    expect(screen.getByText('...a1b2')).toBeInTheDocument();
  });

  it('UT-167 a configuração da IA avisa o uso de dados no plano gratuito e a troca de nomes por códigos', async () => {
    renderWithSync(<SettingsPage />, { remote: remoteWith() });
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(FREE_PLAN_NOTICE);
    expect(note).toHaveTextContent(/plano gratuito/);
    expect(note).toHaveTextContent(/pode usar os dados enviados/);
    expect(note).toHaveTextContent(/troca os nomes das pessoas, funções e tipos por códigos/);
  });

  it('desligar a releitura automática esconde o intervalo e grava settings.update pela fila', async () => {
    const user = userEvent.setup();
    const remote = remoteWith();
    renderWithSync(<SettingsPage />, { remote });
    const poll = await screen.findByRole('switch', { name: 'Releitura automática das agendas' });
    expect(screen.getByLabelText(/^Intervalo da releitura/)).toHaveValue('15');

    await user.clear(screen.getByLabelText(/^Intervalo da releitura/));
    await user.type(screen.getByLabelText(/^Intervalo da releitura/), '200');
    expect(screen.getByText('Use um intervalo de 5 a 120 minutos.')).toBeInTheDocument();

    await user.click(poll);
    await waitFor(() => expect(poll).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByLabelText(/^Intervalo da releitura/)).toBeNull();
    await waitFor(() => expect(remote.applyCalls.flat().map((o) => [o.kind, o.payload])).toContainEqual(['settings.update', { calendar_poll_enabled: false }]));
    expect(remote.applyCalls.flat().some((o) => (o.payload as Record<string, unknown>).calendar_poll_minutes === 200)).toBe(false);
  });

  it('agenda nova entra pela fila e "Reler agora" pede calendar_sync', async () => {
    const user = userEvent.setup();
    const remote = remoteWith();
    remote.rpcHandler = (fn) => (fn === 'request_job' ? { job_id: 'job-sync' } : {});
    renderWithSync(<SettingsPage />, { remote });
    const item = await screen.findByRole('listitem', { name: 'pecegeworks' });
    expect(within(item).getByText('conectada')).toBeInTheDocument();
    expect(within(item).getByText('Última leitura 21/10 11:45')).toBeInTheDocument();

    const form = screen.getByRole('form', { name: 'Adicionar agenda' });
    await user.type(within(form).getByLabelText(/^ID da agenda/), 'audiovisualpecege@gmail.com');
    await user.click(within(form).getByRole('button', { name: 'Adicionar agenda' }));

    await waitFor(() =>
      expect(remote.applyCalls.flat().find((o) => o.kind === 'calendar_source.upsert')?.payload).toMatchObject({
        google_calendar_id: 'audiovisualpecege@gmail.com',
        label: 'audiovisualpecege',
        enabled: true,
      }),
    );
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'request_job', args: { kind: 'calendar_sync', payload: {} } }));
    expect(await screen.findByRole('listitem', { name: 'audiovisualpecege' })).toHaveTextContent('aguardando a primeira leitura');
  });

  it('agenda com ID digitado errado e sem eventos: Editar corrige o ID, ela volta a aguardar a leitura e é lida na hora', async () => {
    const user = userEvent.setup();
    const remote = remoteWith();
    remote.rows.calendar_sources?.push(row('cs-2', { google_calendar_id: 'pcegeworks@gmail.com', label: 'Estúdios', enabled: true, status: 'error', last_synced_at: null, last_error: 'Sem acesso à agenda', archived_at: null }));
    remote.rpcHandler = (fn) => (fn === 'request_job' ? { job_id: 'job-sync' } : {});
    renderWithSync(<SettingsPage />, { remote });
    const item = await screen.findByRole('listitem', { name: 'Estúdios' });
    await user.click(within(item).getByRole('button', { name: 'Editar' }));

    const form = screen.getByRole('form', { name: 'Editar Estúdios' });
    const field = within(form).getByLabelText(/^ID da agenda/);
    expect(field).toBeEnabled();
    await user.clear(field);
    await user.type(field, 'pecegeworks@gmail.com');
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(within(form).getByText('Esta agenda já está na lista.')).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, 'Estudios.Pecege@gmail.com');
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(remote.applyCalls.flat().find((o) => o.kind === 'calendar_source.upsert')?.payload).toEqual({ id: 'cs-2', google_calendar_id: 'estudios.pecege@gmail.com', label: 'Estúdios' }),
    );
    const edited = await screen.findByRole('listitem', { name: 'Estúdios' });
    expect(edited).toHaveTextContent('estudios.pecege@gmail.com');
    expect(edited).toHaveTextContent('aguardando a primeira leitura');
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'request_job', args: { kind: 'calendar_sync', payload: {} } }));
  });

  it('agenda sem eventos: Remover pede confirmação e manda calendar_source.remove; ela sai da lista', async () => {
    const user = userEvent.setup();
    const remote = remoteWith();
    remote.rows.calendar_sources?.push(row('cs-2', { google_calendar_id: 'pcegeworks@gmail.com', label: 'Errada', enabled: true, status: 'error', last_synced_at: null, last_error: null, archived_at: null }));
    renderWithSync(<SettingsPage />, { remote });
    const item = await screen.findByRole('listitem', { name: 'Errada' });
    await user.click(within(item).getByRole('button', { name: 'Remover' }));

    const dialog = screen.getByRole('dialog', { name: 'Remover Errada' });
    expect(dialog).toHaveTextContent('pcegeworks@gmail.com');
    expect(dialog).toHaveTextContent('Nada muda na Google Agenda');
    await user.click(within(dialog).getByRole('button', { name: 'Remover agenda' }));

    await waitFor(() => expect(remote.applyCalls.flat().map((o) => [o.kind, o.payload])).toContainEqual(['calendar_source.remove', { id: 'cs-2' }]));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Errada' })).toBeNull());
    expect(screen.getByRole('listitem', { name: 'pecegeworks' })).toBeInTheDocument();
  });

  it('agenda com eventos lidos: o ID fica travado e Remover só oferece desligar a leitura', async () => {
    const user = userEvent.setup();
    const remote = remoteWith();
    remote.rows.events = [row('ev-1', { calendar_source_id: 'cs-1', title: 'Gravação aula', starts_at: '2026-10-21T13:00:00.000Z', ends_at: '2026-10-21T14:00:00.000Z' })];
    renderWithSync(<SettingsPage />, { remote });
    const item = await screen.findByRole('listitem', { name: 'pecegeworks' });

    await user.click(within(item).getByRole('button', { name: 'Editar' }));
    const form = screen.getByRole('form', { name: 'Editar pecegeworks' });
    expect(within(form).getByLabelText(/^ID da agenda/)).toBeDisabled();
    expect(form).toHaveTextContent('A agenda já tem eventos lidos: o ID não muda.');
    await user.clear(within(form).getByLabelText(/^Rótulo/));
    await user.type(within(form).getByLabelText(/^Rótulo/), 'Estúdios');
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(remote.applyCalls.flat().find((o) => o.kind === 'calendar_source.upsert')?.payload).toEqual({ id: 'cs-1', google_calendar_id: 'pecegeworks@gmail.com', label: 'Estúdios' }),
    );

    const renamed = await screen.findByRole('listitem', { name: 'Estúdios' });
    expect(renamed).toHaveTextContent('conectada');
    await user.click(within(renamed).getByRole('button', { name: 'Remover' }));
    const dialog = screen.getByRole('dialog', { name: 'Remover Estúdios' });
    expect(dialog).toHaveTextContent('já tem eventos lidos e não pode ser removida');
    expect(within(dialog).queryByRole('button', { name: 'Remover agenda' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Desligar a leitura' }));

    await waitFor(() => expect(remote.applyCalls.flat().map((o) => [o.kind, o.payload])).toContainEqual(['calendar_source.upsert', { id: 'cs-1', enabled: false }]));
    expect(remote.applyCalls.flat().some((o) => o.kind === 'calendar_source.remove')).toBe(false);
    expect(await screen.findByText('leitura desligada')).toBeInTheDocument();
  });
});
