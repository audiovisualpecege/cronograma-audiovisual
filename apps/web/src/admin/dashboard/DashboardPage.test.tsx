import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithSync } from '../../../test/helpers';
import { eventRow, NOW, slotWith, weekRemote } from '../../../test/weekFixtures';
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
    expect(screen.getByRole('link', { name: 'Gravação aula Biologia (26/10): mudou na agenda' })).toHaveAttribute('href', '#/evento/b1');
  });
});
