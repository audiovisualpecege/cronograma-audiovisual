import type { WorkbookRead } from '@cronograma/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { person, ROLES, TYPES } from '../../test/catalogRows';
import type { JobRoleRow, PersonRow, ServiceTypeRow } from '../data/catalog';
import { ReviewStep } from './ReviewStep';

const READ: WorkbookRead = {
  weeks: [
    {
      weekStart: '2026-10-05',
      layout: 'oficial-2026',
      sheets: ['05 - 11 de OUTUBRO-26'],
      events: [
        {
          date: '2026-10-06', endDate: '2026-10-06', start: '09:00', end: '12:00', allDay: false,
          title: 'Gravação aula Biologia', location: null, notes: null, typeLabel: null, cancelled: false, externalId: null,
          assignments: [{ role: 'Câmera', rawName: 'Joao P.' }],
          source: { sheet: '05 - 11 de OUTUBRO-26', row: 4 },
        },
      ],
    },
  ],
  skipped: [],
  sheets: [],
  message: null,
};

function renderReview(onConfirm = vi.fn()) {
  const people = [person(1, { name: 'João Pedro Silva' }), person(2, { name: 'Maria Souza' })] as unknown as PersonRow[];
  render(
    <ReviewStep
      fileName="planilha.xlsx"
      read={READ}
      people={people}
      roles={ROLES as unknown as JobRoleRow[]}
      types={TYPES as unknown as ServiceTypeRow[]}
      platformWeeks={[]}
      history={[]}
      saving={false}
      error={null}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('ReviewStep', () => {
  it('UT-118 o nome "Joao P." oferece "João Pedro Silva" (sugerido), "Escolher outra", "Criar pessoa inativa" e "Ignorar"', async () => {
    const user = userEvent.setup();
    const onConfirm = renderReview();
    const group = screen.getByRole('group', { name: 'Ligação de Joao P.' });
    const options = within(group).getAllByRole('radio').map((r) => r.closest('label')?.textContent);
    expect(options).toEqual(['João Pedro Silva (sugerido)', 'Escolher outra', 'Criar pessoa inativa', 'Ignorar']);
    expect(within(group).getByRole('radio', { name: 'João Pedro Silva (sugerido)' })).toBeChecked();

    // "Escolher outra" pede a pessoa antes de confirmar.
    await user.click(within(group).getByRole('radio', { name: 'Escolher outra' }));
    expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeDisabled();
    await user.selectOptions(within(group).getByLabelText(/^Pessoa para Joao P\./), 'p-002');
    await user.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect(onConfirm.mock.calls[0]?.[0].name_links).toEqual({ 'Joao P.': { person_id: 'p-002' } });
    // A palavra-chave "aula" do tipo T1 já propõe o tipo do evento.
    expect(onConfirm.mock.calls[0]?.[0].weeks[0].events[0].typeLabel).toBe('T1');
    expect(onConfirm.mock.calls[0]?.[0].role_links).toEqual({ Câmera: 'r-1' });
  });
});
