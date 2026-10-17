import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { person, ROLES, TYPES } from '../../test/catalogRows';
import { FakeRemote } from '../../test/fakeRemote';
import { renderWithSync } from '../../test/helpers';
import type { HistoryFactRow } from '../data/catalog';
import { NO_HISTORY, PatternsPage } from './PatternsPage';

function fact(eventId: string, date: string, typeId: string | null, roleId: string | null, personId: string | null, hours = 3): HistoryFactRow {
  return {
    event_id: eventId, week_start: date, event_date: date, title: 'Evento', service_type_id: typeId, service_type_name: null,
    job_role_id: roleId, job_role_name: null, person_id: personId, person_name: null, raw_name: null, hours, source: 'import',
  };
}

function remoteWith(facts: HistoryFactRow[]) {
  const remote = new FakeRemote();
  remote.rows = { service_types: TYPES, job_roles: ROLES, people: [person(1, { name: 'Ana Lima' }), person(2, { name: 'Bia Reis' })] };
  remote.views.history_facts = facts;
  return remote;
}

describe('PatternsPage', () => {
  it('UT-117 sem histórico explica que os padrões aparecem depois de importar planilhas ou publicar semanas', async () => {
    renderWithSync(<PatternsPage />, { remote: remoteWith([]) });
    expect(await screen.findByText(NO_HISTORY)).toBeInTheDocument();
    expect(NO_HISTORY).toBe('Os padrões aparecem depois de importar planilhas ou publicar semanas.');
    expect(screen.getByRole('link', { name: 'Importar planilhas' })).toHaveAttribute('href', '#/importar');
  });

  it('mostra a equipe típica por tipo, o aviso de pouco histórico e refaz as contas com o período', async () => {
    const user = userEvent.setup();
    const facts = [
      fact('e1', '2026-09-07', 't-1', 'r-1', 'p-001'),
      fact('e2', '2026-09-14', 't-1', 'r-1', 'p-001'),
      fact('e3', '2026-09-21', 't-1', 'r-1', 'p-002'),
      fact('e4', '2026-09-21', 't-2', 'r-2', 'p-002'),
    ];
    renderWithSync(<PatternsPage />, { remote: remoteWith(facts) });

    const t1 = await screen.findByRole('article', { name: 'Gravação de aula' });
    expect(within(t1).getByText('3 eventos')).toBeInTheDocument();
    expect(within(t1).getByText('1 Câmera')).toBeInTheDocument();
    expect(within(t1).getByText('Câmera: Ana Lima (2), Bia Reis (1)')).toBeInTheDocument();
    expect(within(t1).queryByText('pouco histórico')).toBeNull();
    expect(within(screen.getByRole('article', { name: 'Evento externo' })).getByText('pouco histórico')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^De/), '2026-09-14');
    expect(within(screen.getByRole('article', { name: 'Gravação de aula' })).getByText('2 eventos')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Pessoa/), 'p-002');
    expect(screen.getByText(/Carga média: 6 h e 2 eventos por semana, em 1 semana/)).toBeInTheDocument();
  });
});
