import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSync } from '../../test/helpers';
import { eventRow, weekRemote } from '../../test/weekFixtures';
import type { EventRow } from '../data/catalog';
import { agendaDifferences, RereadReview } from './RereadReview';

const APAGADO = eventRow('eh', { title: 'Não marcar nada', ignored: true, hidden_at: '2026-10-21T15:00:00.000Z' });
const INTERNA = eventRow('ei', { title: 'Montagem do estúdio', origin: 'internal', calendar_source_id: null, google_event_id: null });
const ANTIGO = eventRow('ep', { title: 'Apagado na semana passada', week_start: '2026-10-12', ignored: true, hidden_at: '2026-10-13T15:00:00.000Z' });

describe('Diferenças com a agenda depois da releitura', () => {
  it('separa o que foi apagado aqui e segue na agenda do que só existe no cronograma, de agora em diante', () => {
    const d = agendaDifferences([APAGADO, INTERNA, ANTIGO, eventRow('ea')] as unknown as EventRow[], '2026-10-19');
    expect(d.hidden.map((e) => e.id)).toEqual(['eh']);
    expect(d.internal.map((e) => e.id)).toEqual(['ei']);
  });

  it('"Trazer de volta" manda event.unhide e "Manter" só tira da lista', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [APAGADO, INTERNA] });
    const onClose = vi.fn();
    const view = renderWithSync(<RereadReview fromWeek="2026-10-19" onClose={onClose} />, { remote });
    await view.engine.pull('events');
    const dialog = await screen.findByRole('dialog', { name: 'Diferenças com a agenda' });
    const hidden = within(dialog).getByRole('region', { name: 'Apagados aqui, ainda na agenda' });
    expect(hidden).toHaveTextContent('Não marcar nada');
    await user.click(within(hidden).getByRole('button', { name: 'Trazer de volta' }));
    await waitFor(() => expect(remote.applyCalls.flat().find((o) => o.kind === 'event.unhide')).toMatchObject({ payload: { id: 'eh' } }));
    const internal = within(dialog).getByRole('region', { name: 'Só no cronograma, fora da agenda' });
    await user.click(within(internal).getByRole('button', { name: 'Manter' }));
    expect(dialog).toHaveTextContent('Tudo decidido.');
    expect(remote.applyCalls.flat().some((o) => o.kind === 'event.hide')).toBe(false);
  });
});
