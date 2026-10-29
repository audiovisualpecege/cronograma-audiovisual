import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithSync } from '../../../test/helpers';
import { weekRemote } from '../../../test/weekFixtures';
import { ServiceTypesPage } from './ServiceTypesPage';

describe('ServiceTypesPage: ícone do tipo', () => {
  it('o tipo novo leva o ícone escolhido no banco de ícones', async () => {
    const user = userEvent.setup();
    const remote = weekRemote();
    const view = renderWithSync(<ServiceTypesPage />, { remote });
    await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
    await user.click(await screen.findByRole('button', { name: /Novo tipo/ }));
    const form = await screen.findByRole('form', { name: 'Tipo de serviço' });
    await user.type(within(form).getByLabelText('Nome'), 'Videocast');
    const bank = within(form).getByRole('radiogroup', { name: 'Ícone do tipo' });
    expect(within(bank).getByRole('radio', { name: /Automático/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(bank).getByRole('radio', { name: 'Podcast' }));
    expect(within(bank).getByRole('radio', { name: 'Podcast' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(form).getByLabelText(/Não exige equipe/));
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(remote.applyCalls.flat().find((o) => o.kind === 'service_type.upsert')).toMatchObject({ payload: { name: 'Videocast', icon: 'podcast', no_team: true } }),
    );
  });
});
