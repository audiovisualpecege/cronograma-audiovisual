import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAsMe, renderWithSync } from '../../test/helpers';
import { pub, teamEvent, teamRemote } from '../../test/teamFixtures';
import { eventRow, NOW, slotWith, weekRemote } from '../../test/weekFixtures';
import type { Row } from '../sync/types';
import { EventPage, FIX_IN_CALENDAR } from './EventPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const CALENDAR = eventRow('b1', {
  title: 'Gravação aula Biologia',
  location: 'Estúdio 1',
  description: 'Aula 3 do módulo',
  starts_at: '2026-10-26T09:00:00-03:00',
  ends_at: '2026-10-26T12:00:00-03:00',
});
const INTERNAL = eventRow('i1', { origin: 'internal', calendar_source_id: null, google_event_id: null, title: 'Plantão de edição', location: 'Ilha 2', service_type_id: null });

async function open(id: string, events: Row[] = [CALENDAR, INTERNAL]) {
  const remote = weekRemote({ events, slots: [slotWith('b1', 'r1', 'p3'), slotWith('b1', 'r5')] });
  const view = renderWithSync(<EventPage params={{ id }} />, { remote });
  await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  return { ...view, remote };
}

describe('EventPage', () => {
  it('UT-111 evento da agenda mostra horário, local, título e descrição só leitura com "Corrija na Google Agenda"', async () => {
    await open('b1');
    const agenda = await screen.findByRole('region', { name: 'Dados da agenda' });
    expect(agenda).toHaveTextContent('Gravação aula Biologia');
    expect(agenda).toHaveTextContent('26/10 09:00 às 12:00');
    expect(agenda).toHaveTextContent('Estúdio 1');
    expect(agenda).toHaveTextContent('Aula 3 do módulo');
    expect(agenda).toHaveTextContent('pecegeworks');
    expect(within(agenda).getByRole('note')).toHaveTextContent(FIX_IN_CALENDAR);
    expect(within(agenda).queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar atividade' })).toBeNull();
    // Os dados extras continuam editáveis (US-012).
    expect(screen.getByRole('form', { name: 'Dados extras' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Observações/)).toBeEnabled();
    expect(await screen.findByRole('listitem', { name: 'Câmera: Pessoa Exemplo 03' })).toBeInTheDocument();
  });

  it('UT-111 atividade interna deixa editar título, horário e local', async () => {
    const user = userEvent.setup();
    const { remote } = await open('i1');
    const card = await screen.findByRole('region', { name: 'Atividade interna' });
    expect(within(card).queryByRole('note')).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Editar atividade' }));
    const form = await screen.findByRole('form', { name: 'Atividade interna' });
    const title = within(form).getByLabelText(/^Título/);
    expect(title).toHaveValue('Plantão de edição');
    await user.clear(title);
    await user.type(title, 'Plantão de finalização');
    await user.clear(within(form).getByLabelText(/^Local/));
    await user.type(within(form).getByLabelText(/^Local/), 'Ilha 3');
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(remote.applyCalls.flat().find((o) => o.kind === 'event.internal_upsert')).toMatchObject({
        payload: { id: 'i1', title: 'Plantão de finalização', location: 'Ilha 3', starts_at: '2026-10-26T12:00:00.000Z', ends_at: '2026-10-26T15:00:00.000Z' },
        baseVersion: 1,
      }),
    );
    expect(await screen.findByRole('heading', { name: /Plantão de finalização/ })).toBeInTheDocument();
  });

  it('observação acima de 2.000 caracteres é recusada com contador (US-012 EC-1)', async () => {
    await open('b1', [{ ...CALENDAR, notes: 'x'.repeat(2001) }]);
    const notes = await screen.findByLabelText(/^Observações/);
    expect(notes).toHaveValue('x'.repeat(2001));
    expect(screen.getByText('A observação vai até 2.000 caracteres.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar dados extras' })).toBeDisabled();
  });

  it('UT-160 perfil Equipe vê as observações do evento sem campo de edição', async () => {
    const event = teamEvent('e1', { title: 'Congresso de Agronegócio', notes: 'Credenciamento às 7h30', location: 'Centro de Convenções' });
    const remote = teamRemote({ events: [event], published: [pub('e1', 'r2', 'p10', { notes: 'Credenciamento às 7h30' }), pub('e1', 'r1', 'p7'), pub('e1', 'r6', null)] });
    const view = renderAsMe(<EventPage params={{ id: 'e1' }} />, { remote });
    await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
    const notes = await screen.findByRole('region', { name: 'Observações' });
    expect(notes).toHaveTextContent('Credenciamento às 7h30');
    // Os escalados chegam depois das observações (published_assignments é outra tabela).
    const crew = await screen.findByRole('list', { name: 'Escalados' });
    expect(crew).toHaveTextContent('Áudio Pessoa Exemplo 10');
    expect(crew).toHaveTextContent('Câmera Pessoa Exemplo 07');
    expect(crew).toHaveTextContent('Produção a definir');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Dados extras' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Salvar|Editar|Escalar|Trocar/ })).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
