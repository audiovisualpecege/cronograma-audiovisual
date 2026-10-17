import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FAKE_URL } from '../../test/fakeRemote';
import { renderAsMe } from '../../test/helpers';
import { teamRemote } from '../../test/teamFixtures';
import { IcalPage, ICAL_DELAY_NOTE } from './IcalPage';

describe('IcalPage', () => {
  it('UT-173 a tela da agenda pessoal mostra o aviso de que o calendário pode levar horas para atualizar', async () => {
    renderAsMe(<IcalPage />, { remote: teamRemote() });
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent(ICAL_DELAY_NOTE);
    expect(note).toHaveTextContent('no Google, até cerca de 12 horas');
  });

  it('ligar chama set_ical_feed e mostra o link; "Gerar link novo" pede regenerate', async () => {
    const user = userEvent.setup();
    const remote = teamRemote();
    let token = 'token-1';
    remote.rpcHandler = (fn, args) => {
      if (fn !== 'set_ical_feed') return {};
      if (args.regenerate) token = 'token-2';
      const own = remote.rows.people?.[0];
      if (own) remote.rows.people = [{ ...own, ical_token: args.enabled ? token : null, version: own.version + 1, updated_at: `2026-10-21T15:00:0${remote.rpcCalls.length}.000Z` }];
      return { url: args.enabled ? `/storage/v1/object/public/ical/${token}.ics` : null };
    };
    const view = renderAsMe(<IcalPage />, { remote });
    await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());

    await user.click(screen.getByRole('switch', { name: /Minha agenda no meu calendário/ }));
    expect(await screen.findByLabelText('Link da sua agenda')).toHaveValue(`${FAKE_URL}/storage/v1/object/public/ical/token-1.ics`);

    await user.click(screen.getByRole('button', { name: 'Gerar link novo' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Gerar link novo' })).getByRole('button', { name: 'Gerar link novo' }));
    await waitFor(() => expect(screen.getByLabelText('Link da sua agenda')).toHaveValue(`${FAKE_URL}/storage/v1/object/public/ical/token-2.ics`));

    await user.click(screen.getByRole('switch', { name: /Minha agenda no meu calendário/ }));
    await waitFor(() => expect(screen.queryByLabelText('Link da sua agenda')).toBeNull());
    expect(remote.rpcCalls.map((c) => c.args)).toEqual([
      { enabled: true, regenerate: false },
      { enabled: true, regenerate: true },
      { enabled: false, regenerate: false },
    ]);
  });
});
