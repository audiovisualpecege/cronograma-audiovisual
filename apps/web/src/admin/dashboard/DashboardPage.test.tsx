import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithSync } from '../../../test/helpers';
import { eventRow, NOW, slotWith, weekRemote } from '../../../test/weekFixtures';
import { REREAD_CONFIRM } from '../../week/RereadButton';
import { DashboardPage } from './DashboardPage';
import { workerAlert } from './pending';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe('DashboardPage', () => {
  it('UT-114 worker_seen_at há 6 min mostra "Serviço de fundo parado desde hh:mm"', async () => {
    expect(workerAlert(minutesAgo(6), NOW)).toBe('Serviço de fundo parado desde 11:54');
    renderWithSync(<DashboardPage />, { remote: weekRemote({ settings: { worker_seen_at: minutesAgo(6) } }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço de fundo parado desde 11:54');
  });

  it('UT-114 worker_seen_at há 4 min não mostra o aviso', async () => {
    expect(workerAlert(minutesAgo(4), NOW)).toBeNull();
    const view = renderWithSync(<DashboardPage />, { remote: weekRemote({ settings: { worker_seen_at: minutesAgo(4) } }) });
    await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
    expect(await screen.findByText('Nenhuma pendência. A escala está em dia.')).toBeInTheDocument();
    expect(screen.queryByText(/Serviço de fundo/)).toBeNull();
  });

  it('mostra as pendências no topo: mudança da agenda, vagas sem escala e propostas (US-001 AC-2)', async () => {
    const remote = weekRemote({
      events: [eventRow('b1', { title: 'Gravação aula Biologia', status: 'changed', review_pending: true, change_original: { location: 'Estúdio 2' } })],
      slots: [slotWith('b1', 'r1'), slotWith('b1', 'r5', 'p17', 'proposed')],
      settings: { worker_seen_at: minutesAgo(1) },
    });
    renderWithSync(<DashboardPage />, { remote });
    const list = await screen.findByRole('list', { name: 'Pendências' });
    await waitFor(() => {
      expect(list).toHaveTextContent('Gravação aula Biologia (26/10): mudou na agenda');
      expect(list).toHaveTextContent('Semana de 26/10: 1 vaga sem escala');
      expect(list).toHaveTextContent('Semana de 26/10: 1 proposta para revisar');
    });
    expect(within(list).getByRole('link', { name: 'Gravação aula Biologia (26/10): mudou na agenda' })).toHaveAttribute('href', '#/evento/b1');
  });

  it('mostra as 3 semanas a partir da atual em cartões, com a situação de cada uma', async () => {
    const remote = weekRemote({ events: [eventRow('b1')], slots: [slotWith('b1', 'r1'), slotWith('b1', 'r5', 'p17', 'proposed')], settings: { worker_seen_at: minutesAgo(1) } });
    renderWithSync(<DashboardPage />, { remote });
    const cards = await screen.findByRole('list', { name: 'Próximas semanas' });
    await waitFor(() => expect(within(cards).getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual([
      'Esta semana: semana de 19/10, sem montagem',
      'Próxima semana: semana de 26/10, em montagem',
      'Daqui a 2 semanas: semana de 02/11, sem montagem',
    ]));
    expect(within(cards).getByRole('link', { name: /semana de 19\/10/ })).toHaveAttribute('aria-current', 'date');
    const next = within(cards).getByRole('link', { name: /semana de 26\/10/ });
    expect(next).not.toHaveAttribute('aria-current');
    expect(next).toHaveAttribute('href', '#/semana/2026-10-26');
    await waitFor(() => expect(next).toHaveTextContent('1 evento, 1 vaga sem escala, 1 proposta para revisar'));
  });

  it('avisos da agenda vêm antes das pendências, da mudança mais recente para a mais antiga', async () => {
    const remote = weekRemote({
      events: [
        eventRow('b1', { title: 'Gravação aula Biologia', status: 'changed', review_pending: true, change_original: { location: 'Estúdio 2', startsAt: '2026-10-26T08:00:00-03:00' }, updated_at: '2026-10-21T13:00:00.000Z' }),
        eventRow('b2', { title: 'Podcast', status: 'cancelled', review_pending: true, updated_at: '2026-10-21T14:00:00.000Z' }),
        eventRow('b3', { title: 'Sem mudança' }),
      ],
      settings: { worker_seen_at: minutesAgo(1) },
    });
    renderWithSync(<DashboardPage />, { remote });
    const notices = await screen.findByRole('list', { name: 'Avisos da agenda' });
    await waitFor(() => expect(within(notices).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Podcast (26/10): cancelado na agenda',
      'Gravação aula Biologia (26/10): mudou o local e o horário na agenda',
    ]));
    const [cancelled, changed] = within(notices).getAllByRole('listitem');
    expect(cancelled).toHaveClass('notice--cancelled');
    expect(changed).toHaveClass('notice--changed');
    const pending = screen.getByRole('list', { name: 'Pendências' });
    expect(notices.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('os avisos do administrador ficam numa aba do Painel', async () => {
    const user = userEvent.setup();
    renderWithSync(<DashboardPage />, { remote: weekRemote({ settings: { worker_seen_at: minutesAgo(1) } }) });
    expect(await screen.findByRole('tab', { name: 'Resumo' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: /^Avisos/ }));
    expect(screen.queryByRole('list', { name: 'Próximas semanas' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Resumo' }));
    expect(await screen.findByRole('list', { name: 'Próximas semanas' })).toBeInTheDocument();
  });

  it('"Reler agora" pede confirmação por causa do limite diário antes de pedir a leitura', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ settings: { worker_seen_at: minutesAgo(1) } });
    remote.rpcHandler = (fn) => (fn === 'request_job' ? { job_id: 'job-r' } : {});
    renderWithSync(<DashboardPage />, { remote });
    await user.click(await screen.findByRole('button', { name: 'Reler agora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reler as agendas' });
    expect(dialog).toHaveTextContent(REREAD_CONFIRM);
    expect(REREAD_CONFIRM).toBe('Existe um limite de sincronizações diárias. Tem certeza que quer continuar a releitura?');
    expect(remote.rpcCalls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Continuar a releitura' }));
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'request_job', args: { kind: 'calendar_sync', payload: {} } }));
  });
});
