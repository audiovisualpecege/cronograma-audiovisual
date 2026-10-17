import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { row, SETTINGS } from '../../test/catalogRows';
import { FakeRemote } from '../../test/fakeRemote';
import { renderWithSync } from '../../test/helpers';
import { FREE_PLAN_NOTICE } from './AiSettings';
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
});
