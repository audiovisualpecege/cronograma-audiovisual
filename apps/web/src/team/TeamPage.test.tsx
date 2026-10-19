import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERF_BUDGET, renderAsMe } from '../../test/helpers';
import { pub, publicPeople, teamEvent, teamRemote, type TeamSetup } from '../../test/teamFixtures';
import { NOW } from '../../test/weekFixtures';
import { MAX_RENDERED } from '../ui/VirtualList';
import { TeamPage } from './TeamPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function open(setup: TeamSetup) {
  const view = renderAsMe(<TeamPage params={{}} />, { remote: teamRemote(setup) });
  await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  return view;
}

const MATEMATICA = teamEvent('e1', { title: 'Gravação aula Matemática', starts_at: '2026-10-22T14:00:00-03:00', ends_at: '2026-10-22T17:00:00-03:00', service_type_id: 't1' });
const CONGRESSO = teamEvent('e2', { title: 'Congresso de Agronegócio', starts_at: '2026-10-23T08:00:00-03:00', ends_at: '2026-10-23T12:00:00-03:00', service_type_id: 't2' });
const REUNIAO = teamEvent('e3', { title: 'Reunião de pauta', starts_at: '2026-10-20T10:00:00-03:00', ends_at: '2026-10-20T11:00:00-03:00', service_type_id: 't4', no_team: true });
const WEEK_A_PUBLISHED = [pub('e1', 'r1', 'p5'), pub('e1', 'r5', 'p6'), pub('e2', 'r1', 'p7'), pub('e2', 'r1', 'p8'), pub('e2', 'r2', 'p10'), pub('e2', 'r6', 'p19')];

const list = () => screen.getByRole('list', { name: 'Atividades da equipe' });

describe('TeamPage', () => {
  it('UT-098 filtrado por R2 mostra só atividades com R2; filtro sem resultado mostra "Nenhuma atividade com este filtro" e "Limpar filtros"', async () => {
    const user = userEvent.setup();
    await open({ events: [MATEMATICA, CONGRESSO], published: WEEK_A_PUBLISHED });
    await waitFor(() => expect(within(list()).getByLabelText('Gravação aula Matemática')).toBeInTheDocument());
    expect(within(list()).getByLabelText('Congresso de Agronegócio: Áudio: Pessoa Exemplo 10')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Função'), 'Áudio');
    expect(within(list()).getByLabelText('Congresso de Agronegócio')).toBeInTheDocument();
    expect(within(list()).queryByLabelText('Gravação aula Matemática')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Pessoa'), 'Pessoa Exemplo 05');
    expect(screen.getByText('Nenhuma atividade com este filtro')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(within(list()).getByLabelText('Gravação aula Matemática')).toBeInTheDocument();
    expect(within(list()).getByLabelText('Congresso de Agronegócio')).toBeInTheDocument();
  });

  it('UT-098 filtro por setor usa o setor da pessoa escalada', async () => {
    const user = userEvent.setup();
    await open({ events: [MATEMATICA, CONGRESSO], published: [pub('e1', 'r1', 'p5'), pub('e2', 'r6', 'p1')] });
    await waitFor(() => expect(within(list()).getByLabelText('Congresso de Agronegócio')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Setor'), 'Produção');
    expect(within(list()).getByLabelText('Congresso de Agronegócio')).toBeInTheDocument();
    expect(within(list()).queryByLabelText('Gravação aula Matemática')).toBeNull();
  });

  it('UT-099 vaga publicada sem pessoa mostra "a definir"; evento de T4 (no_team) não aparece', async () => {
    await open({
      events: [MATEMATICA, REUNIAO],
      published: [pub('e1', 'r1', 'p5'), pub('e1', 'r5', null), pub('e3', 'r6', 'p19')],
      extra: { service_types: [] },
    });
    const open_ = await screen.findByLabelText('Gravação aula Matemática: Técnico de aula: a definir');
    expect(within(open_).getByText('a definir', { selector: '[data-seal]' })).toBeInTheDocument();
    expect(within(list()).queryByLabelText('Reunião de pauta')).toBeNull();
    expect(screen.queryByText('Reunião de pauta')).toBeNull();
  });

  it('UT-170 "Equipe" com 150 pessoas renderiza com lista virtual e filtros respondendo em menos de 200 ms', async () => {
    const people = publicPeople(150);
    const events = Array.from({ length: 50 }, (_, i) => {
      const day = 19 + (i % 7);
      const h = String(7 + (i % 12)).padStart(2, '0');
      return teamEvent(`ev${i}`, { title: `Atividade ${String(i + 1).padStart(2, '0')}`, starts_at: `2026-10-${day}T${h}:00:00-03:00`, ends_at: `2026-10-${day}T${h}:45:00-03:00` });
    });
    const published = events.flatMap((e, i) => [pub(e.id, 'r1', `p${(i * 3) % 150 + 1}`), pub(e.id, 'r2', `p${(i * 3 + 1) % 150 + 1}`), pub(e.id, 'r5', `p${(i * 3 + 2) % 150 + 1}`)]);
    await open({ events, published, people });
    await waitFor(() => expect(within(list()).getAllByRole('listitem').length).toBeGreaterThan(0));
    // 50 atividades com 3 vagas e os dias: mais de 200 linhas, nunca mais de 50 desenhadas.
    expect(Number(list().getAttribute('aria-rowcount'))).toBeGreaterThan(200);
    expect(within(list()).getAllByRole('listitem').length).toBeLessThanOrEqual(MAX_RENDERED);
    expect(within(screen.getByLabelText('Pessoa')).getAllByRole('option')).toHaveLength(151);

    const started = performance.now();
    fireEvent.change(screen.getByLabelText('Pessoa'), { target: { value: 'p150' } });
    const lines = within(list()).getAllByRole('listitem');
    const elapsed = performance.now() - started;
    expect(lines.length).toBeLessThan(10);
    expect(lines.some((l) => l.textContent?.includes('Pessoa Exemplo 150'))).toBe(true);
    expect(elapsed).toBeLessThan(200 * PERF_BUDGET);
  });

  it('semana não publicada mostra "A escala desta semana ainda não foi publicada"', async () => {
    await open({ week: null });
    expect(await screen.findByText('A escala desta semana ainda não foi publicada.')).toBeInTheDocument();
  });
});
