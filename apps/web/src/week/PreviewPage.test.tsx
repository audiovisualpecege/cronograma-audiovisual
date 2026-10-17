import { addDays } from '@cronograma/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { row } from '../../test/catalogRows';
import { FakeRemote } from '../../test/fakeRemote';
import { renderWithSync } from '../../test/helpers';
import { CREW_ROWS, eventRow, NOW, peopleRows, personRoleRows, ROLE_ROWS, SOURCES, TYPE_ROWS, WEEK_B, weekRemote } from '../../test/weekFixtures';
import type { CalendarSourceRow, CrewRow, EventRow, JobRoleRow, PersonRoleRow, PersonRow, ServiceTypeRow } from '../data/catalog';
import { LocalStore } from '../sync/localStore';
import { SyncEngine } from '../sync/syncEngine';
import { SyncProvider } from '../sync/SyncProvider';
import type { WeekRows } from './model';
import { NO_EVENTS, PreviewPage } from './PreviewPage';
import { WeekPage } from './WeekPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function page(remote: FakeRemote) {
  const view = renderWithSync(<WeekPage params={{ date: WEEK_B }} />, { remote });
  await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  return view;
}

describe('PreviewPage', () => {
  it('UT-154 trocar o tipo de T1 para T2 muda a equipe estimada para 2 R1, 1 R2, 1 R6', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ week: null, events: [eventRow('b1', { title: 'Gravação aula Biologia' })] });
    await page(remote);
    const item = await screen.findByRole('listitem', { name: 'Gravação aula Biologia' });
    expect(within(item).getByLabelText('Equipe estimada')).toHaveTextContent('Equipe estimada: 1 Câmera, 1 Técnico de aula');
    expect(within(item).getByText('certeza alta')).toBeInTheDocument();
    expect(item).toHaveTextContent('Agenda pecegeworks');

    expect(item).toHaveTextContent('Gravação de aula');
    await user.click(within(item).getByRole('button', { name: 'Trocar o tipo de Gravação aula Biologia' }));
    await user.selectOptions(within(item).getByLabelText('Tipo de serviço de Gravação aula Biologia'), 't2');
    // R1 Câmera, R2 Áudio, R6 Produção.
    await waitFor(() => expect(within(item).getByLabelText('Equipe estimada')).toHaveTextContent('Equipe estimada: 2 Câmera, 1 Áudio, 1 Produção'));
    await waitFor(() =>
      expect(remote.applyCalls.flat().find((o) => o.kind === 'event.update_extras')).toMatchObject({ payload: { id: 'b1', service_type_id: 't2' }, baseVersion: 1 }),
    );
    // Horas por função no topo, pela equipe estimada: 6 h de Câmera pedidas.
    expect(screen.getByRole('listitem', { name: 'Câmera' })).toHaveTextContent('6 h pedidas');
  });

  it('UT-155 semana sem eventos mostra "Nenhum evento nesta semana" sem o botão "Montar semana"', async () => {
    await page(weekRemote({ week: null, events: [] }));
    expect(await screen.findByText(`${NO_EVENTS}.`)).toBeInTheDocument();
    expect(NO_EVENTS).toBe('Nenhum evento nesta semana');
    expect(screen.queryByRole('button', { name: 'Montar semana' })).toBeNull();
  });

  it('UT-157 prévia com 120 eventos aparece agrupada por dia e renderiza em menos de 500 ms', () => {
    const events = Array.from({ length: 120 }, (_, i) => {
      const day = addDays(WEEK_B, i % 6);
      const hour = String(7 + (i % 12)).padStart(2, '0');
      return eventRow(`e${i}`, { title: `Gravação aula ${i}`, starts_at: `${day}T${hour}:00:00-03:00`, ends_at: `${day}T${hour}:50:00-03:00` }) as unknown as EventRow;
    });
    const rows: WeekRows = {
      weekStart: WEEK_B,
      week: null,
      events,
      slots: [],
      assignments: [],
      published: [],
      people: peopleRows() as unknown as PersonRow[],
      personRoles: personRoleRows() as unknown as PersonRoleRow[],
      absences: [],
      roles: ROLE_ROWS as unknown as JobRoleRow[],
      types: TYPE_ROWS as unknown as ServiceTypeRow[],
      crew: CREW_ROWS as unknown as CrewRow[],
    };
    const engine = new SyncEngine({ store: new LocalStore('previa'), remote: new FakeRemote(), profile: 'admin', online: false });
    const started = performance.now();
    render(
      <SyncProvider engine={engine}>
        <PreviewPage rows={rows} sources={SOURCES as unknown as CalendarSourceRow[]} now={NOW} today="2026-10-21" />
      </SyncProvider>,
    );
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(500);
    const days = screen.getAllByRole('region').filter((r) => /^(segunda|terça|quarta|quinta|sexta|sábado|domingo), /.test(r.getAttribute('aria-label') ?? ''));
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual(['segunda, 26/10', 'terça, 27/10', 'quarta, 28/10', 'quinta, 29/10', 'sexta, 30/10', 'sábado, 31/10']);
    expect(within(days[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(20);
  });

  it('UT-158 origem com erro mostra "Agenda X desconectada desde dd/mm hh:mm" com os últimos dados', async () => {
    const broken = row('S2', { google_calendar_id: 'audiovisualpecege@gmail.com', label: 'audiovisualpecege', enabled: true, status: 'error', last_synced_at: '2026-10-20T13:30:00.000Z', last_error: 'Sem acesso à agenda' });
    const remote = weekRemote({ week: null, events: [eventRow('b3', { title: 'Gravação aula Física', calendar_source_id: 'S2' })], extra: { calendar_sources: [SOURCES[0] as never, broken] } });
    await page(remote);
    expect(await screen.findByText(/Agenda audiovisualpecege desconectada desde 20\/10 10:30/)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Gravação aula Física' })).toHaveTextContent('Agenda audiovisualpecege');
  });
});
