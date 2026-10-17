import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { row } from '../../test/catalogRows';
import { renderAsMe } from '../../test/helpers';
import { teamRemote } from '../../test/teamFixtures';
import { NOW } from '../../test/weekFixtures';
import { Bell } from './Bell';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.location.hash = '#/minha-semana';
});

afterEach(() => {
  vi.useRealTimers();
});

function notice(n: number, fields: Record<string, unknown> = {}) {
  const stamp = `2026-10-21T1${n}:00:00.000Z`;
  return {
    ...row(`n${n}`, {
      person_id: 'p10',
      kind: 'week_published',
      title: `Aviso ${n}`,
      body: `Resumo ${n}`,
      link: '#/minha-semana/2026-10-26',
      dedupe_key: `k${n}`,
      read_at: null,
      created_at: stamp,
      ...fields,
    }),
    updated_at: stamp,
  };
}

const bell = () => screen.getByRole('button', { name: /^Avisos/ });

describe('Bell', () => {
  it('UT-100 sino com 3 não lidos mostra 3; tocar num aviso abre o link e grava read_at', async () => {
    const user = userEvent.setup();
    const remote = teamRemote({ notifications: [notice(1), notice(2, { link: '#/evento/e9' }), notice(3), notice(4, { read_at: '2026-10-21T13:00:00.000Z' })] });
    const view = renderAsMe(<Bell />, { remote });
    await waitFor(() => expect(bell()).toHaveAccessibleName('Avisos, 3 não lidos'));
    expect(bell().parentElement).toHaveTextContent('3');

    await user.click(bell());
    const dialog = screen.getByRole('dialog', { name: 'Avisos' });
    expect(within(dialog).getByText('3 avisos novos')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Aviso 2/ }));

    expect(window.location.hash).toBe('#/evento/e9');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(remote.readCalls.flatMap((c) => c.ids)).toEqual(['n2']));
    expect((await view.store.mirror('notifications').get('n2'))?.read_at).toBe(NOW.toISOString());
    await waitFor(() => expect(bell()).toHaveAccessibleName('Avisos, 2 não lidos'));
  });

  it('UT-101 "Marcar todos como lidos" zera o contador', async () => {
    const user = userEvent.setup();
    const remote = teamRemote({ notifications: [notice(1), notice(2), notice(3)] });
    renderAsMe(<Bell />, { remote });
    await waitFor(() => expect(bell()).toHaveAccessibleName('Avisos, 3 não lidos'));
    await user.click(bell());
    await user.click(screen.getByRole('button', { name: 'Marcar todos como lidos' }));
    await waitFor(() => expect(bell()).toHaveAccessibleName('Avisos'));
    expect(screen.getByText('Nenhum aviso novo')).toBeInTheDocument();
    expect(remote.readCalls.flatMap((c) => c.ids).sort()).toEqual(['n1', 'n2', 'n3']);
  });

  it('UT-171 ao abrir depois de fechada, o app puxa notifications e o sino mostra os avisos novos', async () => {
    const remote = teamRemote({ notifications: [notice(1, { read_at: '2026-10-21T12:00:00.000Z' })] });
    const first = renderAsMe(<Bell />, { remote });
    await waitFor(() => expect(first.engine.getState().lastSyncAt).not.toBeNull());
    expect(bell()).toHaveAccessibleName('Avisos');
    first.unmount();
    first.engine.stop();
    first.store.close();

    // Com o app fechado, saem dois avisos.
    remote.rows.notifications = [...(remote.rows.notifications ?? []), notice(2), notice(3)];
    remote.pullCalls = [];
    renderAsMe(<Bell />, { remote });
    await waitFor(() => expect(bell()).toHaveAccessibleName('Avisos, 2 não lidos'));
    // Leitura incremental: só o que mudou desde o cursor gravado na abertura anterior.
    expect(remote.pullCalls.find((c) => c.table === 'notifications')?.cursor).toBe('2026-10-21T11:00:00.000Z');
  });

  it('Realtime em notifications faz o aviso aparecer na hora', async () => {
    const remote = teamRemote();
    const view = renderAsMe(<Bell />, { remote });
    await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
    expect(remote.subscribedTables()).toContain('notifications');
    remote.rows.notifications = [notice(5)];
    remote.emit('notifications');
    await waitFor(() => expect(bell()).toHaveAccessibleName('Avisos, 1 não lido'));
  });
});
