import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSync, setNetwork } from '../../test/helpers';
import { OfflineBanner, offlineBanner } from './OfflineBanner';

const NOW = new Date('2026-10-21T15:00:00.000Z'); // 21/10 12:00 em Brasília

describe('faixa sem internet', () => {
  it('UT-081 última sincronização há 23 h dá faixa info "Sem internet, atualizado em ..."; há 25 h, faixa alert', () => {
    const h23 = new Date(NOW.getTime() - 23 * 3600_000).toISOString();
    const h25 = new Date(NOW.getTime() - 25 * 3600_000).toISOString();
    expect(offlineBanner(false, h23, NOW)).toEqual({ tone: 'info', text: 'Sem internet, atualizado em 20/10 13:00' });
    expect(offlineBanner(false, h25, NOW)).toEqual({ tone: 'alert', text: 'Sem internet, atualizado em 20/10 11:00' });
    expect(offlineBanner(true, h25, NOW)).toBeNull();
  });

  it('a faixa aparece na tela só sem internet, com a data da última atualização', async () => {
    setNetwork(false);
    const { engine } = renderWithSync(<OfflineBanner />);
    expect(await screen.findByRole('status')).toHaveTextContent('Sem internet. Este aparelho ainda não tem cópia dos dados.');
    // Com rede, o motor lê tudo e marca a hora da cópia.
    setNetwork(true);
    await vi.waitFor(() => expect(engine.getState().lastSyncAt).not.toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
    setNetwork(false);
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(/^Sem internet, atualizado em \d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
