import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { row } from '../../test/catalogRows';
import { renderAsMe } from '../../test/helpers';
import { pub, teamEvent, teamRemote, type TeamSetup } from '../../test/teamFixtures';
import { MyWeekPage, SEEN_KEY } from './MyWeekPage';

const WED_10H = new Date('2026-10-21T10:00:00-03:00');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(WED_10H);
  window.location.hash = '#/minha-semana';
});

afterEach(() => {
  vi.useRealTimers();
});

async function open(setup: TeamSetup, params: Record<string, string> = {}, seenAt?: string) {
  const remote = teamRemote(setup);
  if (seenAt) {
    // "Visto por último" gravado numa abertura anterior neste aparelho.
    const { LocalStore } = await import('../sync/localStore');
    const store = new LocalStore('tela');
    await store.setMeta(SEEN_KEY, seenAt);
    store.close();
  }
  const view = renderAsMe(<MyWeekPage params={params} />, { remote });
  await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  return view;
}

const day = (label: RegExp | string) => screen.getByRole('listitem', { name: label });

describe('MyWeekPage', () => {
  it('UT-091 com relógio em 21/10 10:00, abre 21/10 expandido e destacado, com a atividade de 14:00 no topo', async () => {
    const early = teamEvent('cedo', { title: 'Abertura de estúdio', starts_at: '2026-10-21T08:00:00-03:00', ends_at: '2026-10-21T09:00:00-03:00' });
    const later = teamEvent('tarde', { title: 'Gravação aula Matemática', starts_at: '2026-10-21T14:00:00-03:00', ends_at: '2026-10-21T17:00:00-03:00' });
    const other = teamEvent('quinta', { title: 'Congresso de Agronegócio', starts_at: '2026-10-22T08:00:00-03:00', ends_at: '2026-10-22T12:00:00-03:00' });
    await open({ events: [early, later, other], published: [pub('cedo', 'r2', 'p10'), pub('tarde', 'r2', 'p10'), pub('quinta', 'r2', 'p10')] });

    const today = await screen.findByRole('listitem', { name: 'quarta, 21/10' });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(within(today).getAllByText('hoje', { selector: '[data-seal]' }).length).toBeGreaterThan(0);
    expect(today.querySelector('details')).toHaveAttribute('open');
    const list = within(today).getByRole('list', { name: /Atividades de/ });
    const titles = within(list).getAllByRole('article').map((a) => a.getAttribute('aria-label'));
    expect(titles).toEqual(['Gravação aula Matemática', 'Abertura de estúdio']);
    // Os outros dias da semana corrente ficam fechados.
    expect(day('quinta, 22/10').querySelector('details')).not.toHaveAttribute('open');
  });

  it('UT-092 atividade alterada depois de last_seen_at mostra o selo "mudou" e o campo que mudou', async () => {
    const moved = teamEvent('e1', {
      title: 'Gravação aula Matemática',
      location: 'Estúdio 3',
      status: 'changed',
      change_original: { title: 'Gravação aula Matemática', location: 'Estúdio 1', startsAt: '2026-10-22T14:00:00-03:00', endsAt: '2026-10-22T17:00:00-03:00', allDay: false },
      updated_at: '2026-10-21T09:30:00.000Z',
    });
    const same = teamEvent('e2', { title: 'Congresso de Agronegócio', updated_at: '2026-10-19T09:30:00.000Z' });
    await open({ events: [moved, same], published: [pub('e1', 'r2', 'p10'), pub('e2', 'r2', 'p10')] }, {}, '2026-10-20T12:00:00.000Z');

    const card = await screen.findByRole('article', { name: 'Gravação aula Matemática' });
    expect(within(card).getByText('mudou', { selector: '[data-seal]' })).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: 'O que mudou' })).toHaveTextContent('Local: era Estúdio 1, agora Estúdio 3');
    expect(within(screen.getByRole('article', { name: 'Congresso de Agronegócio' })).queryByText('mudou')).toBeNull();
  });

  it('UT-093 atividade cancelada aparece riscada com o selo "cancelado"', async () => {
    await open({ events: [teamEvent('e1', { title: 'Gravação aula Matemática', status: 'cancelled' })], published: [pub('e1', 'r2', 'p10')] });
    const card = await screen.findByRole('article', { name: 'Gravação aula Matemática' });
    expect(within(card).getByRole('heading')).toHaveClass('is-cancelled');
    expect(within(card).getByText('cancelado', { selector: '[data-seal]' })).toBeInTheDocument();
  });

  it('UT-094 semana sem publicação mostra "A escala desta semana ainda não foi publicada"', async () => {
    await open({ week: null, events: [] });
    expect(await screen.findByText('A escala desta semana ainda não foi publicada.')).toBeInTheDocument();
  });

  it('UT-094 semana publicada sem a pessoa mostra "Você não está escalado nesta semana"', async () => {
    await open({ events: [teamEvent('e1')], published: [pub('e1', 'r1', 'p5')] });
    expect(await screen.findByText('Você não está escalado nesta semana.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('UT-095 férias da pessoa em 22/10 mostram "férias" no dia', async () => {
    const vacation = row('aus-1', { person_id: 'p10', kind: 'ferias', starts_at: '2026-10-22T00:00:00-03:00', ends_at: '2026-10-23T00:00:00-03:00', all_day: true, note: null, archived_at: null });
    await open({ events: [teamEvent('e1', { starts_at: '2026-10-23T08:00:00-03:00', ends_at: '2026-10-23T12:00:00-03:00' })], published: [pub('e1', 'r2', 'p10')], absences: [vacation] });
    const thursday = await screen.findByRole('listitem', { name: 'quinta, 22/10' });
    expect(within(thursday).getByText('férias', { selector: '[data-seal]' })).toBeInTheDocument();
    expect(within(day('sexta, 23/10')).queryByText('férias')).toBeNull();
  });

  it('UT-096 tocar no local "Av. Paulista, 1000" abre o mapa do aparelho', async () => {
    await open({ events: [teamEvent('e1', { location: 'Av. Paulista, 1000' })], published: [pub('e1', 'r2', 'p10'), pub('e1', 'r1', 'p5'), pub('e1', 'r6', null)] });
    const link = await screen.findByRole('link', { name: 'Av. Paulista, 1000' });
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Av.%20Paulista%2C%201000');
    expect(link).toHaveAttribute('target', '_blank');
    // Colegas e a vaga aberta da mesma atividade.
    const colleagues = screen.getByRole('list', { name: 'Colegas' });
    expect(colleagues).toHaveTextContent('Pessoa Exemplo 05 (Câmera)');
    expect(colleagues).toHaveTextContent('a definir (Produção)');
  });

  it('UT-097 título de 200 caracteres aparece inteiro, sem reticências', async () => {
    const title = `Gravação ${'muito longa '.repeat(20)}`.slice(0, 200);
    await open({ events: [teamEvent('e1', { title })], published: [pub('e1', 'r2', 'p10')] });
    const heading = within(await screen.findByRole('article', { name: title })).getByRole('heading');
    expect(heading.textContent).toBe(title);
    expect(heading.textContent).toHaveLength(200);
    expect(heading.textContent).not.toContain('...');
    expect(heading.textContent).not.toContain('…');
  });

  it('UT-168 "Semana seguinte" e "Semana anterior" mudam a semana exibida em 7 dias', async () => {
    const user = userEvent.setup();
    await open({ events: [] });
    expect(await screen.findByRole('heading', { name: 'MINHA SEMANA 19/10' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Semana seguinte' }));
    expect(window.location.hash).toBe('#/minha-semana/2026-10-26');
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(window.location.hash).toBe('#/minha-semana/2026-10-12');
  });

  it('UT-168 a semana da rota é exibida e qualquer dia dela cai na segunda-feira', async () => {
    await open({ events: [] }, { date: '2026-10-28' });
    expect(await screen.findByRole('heading', { name: 'MINHA SEMANA 26/10' })).toBeInTheDocument();
  });

  it('UT-169 dia com 12 atividades mostra as 12, com rolagem', async () => {
    const events = Array.from({ length: 12 }, (_, i) => {
      const h = String(7 + i).padStart(2, '0');
      return teamEvent(`e${i}`, { title: `Atividade ${i + 1}`, starts_at: `2026-10-22T${h}:00:00-03:00`, ends_at: `2026-10-22T${h}:30:00-03:00` });
    });
    await open({ events, published: events.map((e) => pub(e.id, 'r2', 'p10')) });
    const list = await screen.findByRole('list', { name: 'Atividades de quinta, 22/10' });
    await waitFor(() => expect(within(list).getAllByRole('article')).toHaveLength(12));
    expect(list).toHaveStyle({ overflowY: 'auto' });
  });

  it('só a revisão corrente da fotografia entra (linhas antigas da cópia local ficam de fora)', async () => {
    await open({ events: [teamEvent('e1', { title: 'Congresso de Agronegócio' })], published: [pub('e1', 'r2', 'p11', { revision: 1 }), pub('e1', 'r2', 'p10')] });
    const card = await screen.findByRole('article', { name: 'Congresso de Agronegócio' });
    expect(within(card).queryByText(/Pessoa Exemplo 11/)).toBeNull();
  });
});
