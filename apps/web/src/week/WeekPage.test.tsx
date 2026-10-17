import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { row } from '../../test/catalogRows';
import { renderWithSync } from '../../test/helpers';
import { eventRow, NOW, peopleRows, personRoleRows, slotWith, WEEK_B, weekRemote } from '../../test/weekFixtures';
import { AI_OFF } from './ProposalBar';
import { WeekPage } from './WeekPage';

beforeEach(() => {
  // Só o relógio: a semana B (26/10) fica futura, como na semente.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const AULA = eventRow('ea', { title: 'Gravação aula Biologia' });
const TARDE = eventRow('eb', { title: 'Gravação aula Química', starts_at: '2026-10-26T14:00:00-03:00', ends_at: '2026-10-26T17:00:00-03:00' });

/** Abre a semana e espera a primeira leitura completa da cópia local. */
async function page(remote: ReturnType<typeof weekRemote>) {
  const view = renderWithSync(<WeekPage params={{ date: WEEK_B }} />, { remote });
  await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  return view;
}

const ops = (remote: ReturnType<typeof weekRemote>) => remote.applyCalls.flat();

describe('WeekPage: escala manual', () => {
  it('UT-110 pessoa com over_limit mostra o alerta e só envia assignment.set com override depois de "Escalar mesmo assim"', async () => {
    const user = userEvent.setup();
    const open = slotWith('ea', 'r1');
    const busy = slotWith('eb', 'r1', 'p3');
    const remote = weekRemote({ events: [AULA, TARDE], slots: [open, busy], people: peopleRows(20, { p3: { weekly_limit_hours: 4 } }) });
    await page(remote);

    const event = await screen.findByRole('article', { name: 'Gravação aula Biologia' });
    await user.click(await within(event).findByRole('button', { name: 'Escalar' }));
    const others = await screen.findByRole('list', { name: 'Outras pessoas' });
    const p3 = within(others).getByRole('button', { name: 'Pessoa Exemplo 03' });
    expect(p3).toHaveTextContent('passa do limite semanal');
    await user.click(p3);

    expect(await screen.findByRole('alert')).toHaveTextContent('Pessoa Exemplo 03: passa do limite semanal');
    expect(ops(remote).some((o) => o.kind === 'assignment.set')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Escalar mesmo assim' }));

    await waitFor(() =>
      expect(ops(remote).find((o) => o.kind === 'assignment.set')).toMatchObject({
        payload: { slot_id: open.slot.id, person_id: 'p3', override: true },
        baseVersion: 1,
      }),
    );
    expect(await within(event).findByText('passa do limite semanal')).toBeInTheDocument();
  });

  it('UT-116 alternar a visualização troca a lista por evento pela grade pessoa por dia, com as mesmas alocações', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({
      events: [AULA, TARDE],
      slots: [slotWith('ea', 'r1', 'p3'), slotWith('ea', 'r5', 'p17', 'proposed'), slotWith('eb', 'r1', 'p4'), slotWith('eb', 'r5')],
    });
    await page(remote);
    await screen.findByRole('listitem', { name: 'Técnico de aula: Vaga aberta' });

    const fromList = new Set<string>();
    for (const article of screen.getAllByRole('article')) {
      for (const item of within(article).getAllByRole('listitem')) {
        const [role, who] = (item.getAttribute('aria-label') ?? '').split(': ');
        if (who !== 'Vaga aberta') fromList.add(`${who}|${article.getAttribute('aria-label')}|${role}`);
      }
    }
    expect(fromList.size).toBe(3);

    await user.click(screen.getByRole('tab', { name: 'Grade por pessoa' }));
    const grid = await screen.findByRole('table', { name: 'Grade da semana por pessoa e dia' });
    const fromGrid = new Set<string>();
    for (const chip of within(grid).getAllByRole('button')) {
      const [who, rest] = (chip.getAttribute('aria-label') ?? '').split(': ');
      const [title, role] = (rest ?? '').split(', ');
      if (who !== 'Vaga aberta') fromGrid.add(`${who}|${title}|${role}`);
    }
    expect(fromGrid).toEqual(fromList);
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('UT-164 o painel de carga marca em destaque quem passa do limite semanal', async () => {
    const remote = weekRemote({
      events: [AULA, TARDE],
      slots: [slotWith('ea', 'r1', 'p3'), slotWith('eb', 'r1', 'p3'), slotWith('eb', 'r5', 'p17')],
      people: peopleRows(20, { p3: { weekly_limit_hours: 4 } }),
    });
    await page(remote);
    const panel = await screen.findByRole('list', { name: 'Carga por pessoa' });
    const p3 = await within(panel).findByRole('listitem', { name: 'Pessoa Exemplo 03' });
    await waitFor(() => expect(p3).toHaveAttribute('data-over', 'true'));
    expect(p3).toHaveTextContent('6 h de 4 h, 2 atividades');
    expect(within(p3).getByText('passa do limite')).toBeInTheDocument();
    const p17 = within(panel).getByRole('listitem', { name: 'Pessoa Exemplo 17' });
    expect(p17).not.toHaveAttribute('data-over');
    expect(screen.getByText('1 pessoa passa do limite semanal.')).toBeInTheDocument();
  });

  it('UT-165 o seletor de pessoa não lista pessoas inativas', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1')], people: peopleRows(20, { p5: { active: false } }) });
    await page(remote);
    const event = await screen.findByRole('article', { name: 'Gravação aula Biologia' });
    await user.click(await within(event).findByRole('button', { name: 'Escalar' }));
    const apt = await screen.findByRole('list', { name: 'Aptos' });
    expect(within(apt).getByRole('button', { name: 'Pessoa Exemplo 04' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pessoa Exemplo 05' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Escalar' })).not.toHaveTextContent('Pessoa Exemplo 05');
  });
});

describe('WeekPage: pré-escala', () => {
  it('UT-113 com a IA desligada, "Propor escala" some e a tela diz que a escala é manual', async () => {
    const remote = weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1')], settings: { ai_proposal_enabled: false } });
    await page(remote);
    expect(await screen.findByText(AI_OFF)).toBeInTheDocument();
    expect(AI_OFF).toBe('A pré-escala pela IA está desligada; monte a escala à mão.');
    expect(screen.queryByRole('button', { name: 'Propor escala' })).toBeNull();
  });

  it('UT-161 vaga sem nenhum apto fica aberta e a função aparece em falta', async () => {
    // Ninguém de P1 a P13 tem a função R4 (Mediação).
    const remote = weekRemote({ events: [AULA], slots: [slotWith('ea', 'r4')], people: peopleRows(13), personRoles: personRoleRows(13) });
    await page(remote);
    const event = await screen.findByRole('article', { name: 'Gravação aula Biologia' });
    const slot = await within(event).findByRole('listitem', { name: 'Mediação: Vaga aberta' });
    expect(await within(slot).findByText('ninguém apto')).toBeInTheDocument();
    expect(within(slot).getByText('a definir')).toBeInTheDocument();
    const balance = screen.getByRole('listitem', { name: 'Mediação' });
    expect(within(balance).getByText('em falta')).toBeInTheDocument();
    expect(balance).toHaveTextContent('3 h pedidas, 0 h disponíveis');
  });

  it('UT-162 "Propor escala" com propostas pendentes pergunta se substitui; as aceitas não entram na conta', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({
      events: [AULA, TARDE],
      slots: [slotWith('ea', 'r1', 'p3', 'proposed'), slotWith('ea', 'r5', 'p17', 'proposed'), slotWith('eb', 'r1', 'p4', 'confirmed'), slotWith('eb', 'r5')],
    });
    remote.rpcHandler = (fn) => (fn === 'request_job' ? { job_id: 'job-1' } : {});
    await page(remote);
    await user.click(await screen.findByRole('button', { name: 'Propor escala' }));
    const dialog = await screen.findByRole('dialog', { name: 'Propor escala' });
    expect(dialog).toHaveTextContent('Substituir as 2 propostas pendentes?');
    expect(dialog).toHaveTextContent('As alocações aceitas não mudam.');
    expect(remote.rpcCalls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'request_job', args: { kind: 'propose', payload: { week_id: 'w-b', replace_pending: true } } }));
  });

  it('UT-163 "Trocar pessoa" lista os aptos na ordem de rankCandidates, com horas e atividades na semana', async () => {
    const user = userEvent.setup();
    const proposed = slotWith('ea', 'r1', 'p6', 'proposed', { reason: 'costuma fazer gravação de aula; 0 h na semana' });
    const remote = weekRemote({ events: [AULA, TARDE], slots: [proposed, slotWith('eb', 'r1', 'p3')] });
    await page(remote);
    const event = await screen.findByRole('article', { name: 'Gravação aula Biologia' });
    expect(await within(event).findByText('costuma fazer gravação de aula; 0 h na semana')).toBeInTheDocument();
    await user.click(within(event).getByRole('button', { name: 'Trocar pessoa' }));
    const apt = await screen.findByRole('list', { name: 'Aptos' });
    const names = within(apt).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    // Sem histórico, todos empatam: menor carga primeiro e depois o código (P4, P5, P7, P8, P18); P3 já tem 3 h.
    expect(names).toEqual(['Pessoa Exemplo 04', 'Pessoa Exemplo 05', 'Pessoa Exemplo 07', 'Pessoa Exemplo 08', 'Pessoa Exemplo 18', 'Pessoa Exemplo 03']);
    expect(within(apt).getByRole('button', { name: 'Pessoa Exemplo 03' })).toHaveTextContent('3 h e 1 atividade na semana');
    expect(within(apt).getByRole('button', { name: 'Pessoa Exemplo 04' })).toHaveTextContent('0 h e 0 atividades na semana');

    await user.click(within(apt).getByRole('button', { name: 'Pessoa Exemplo 04' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'assignment.set')?.payload).toEqual({ slot_id: proposed.slot.id, person_id: 'p4', override: false }));
  });
});

describe('WeekPage: publicação', () => {
  it('UT-109 o diálogo de publicar mostra vagas abertas, propostas pendentes e alertas; semana sem alocação pede segunda confirmação', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({
      events: [AULA, TARDE, eventRow('ec', { title: 'Evento externo', service_type_id: 't2', starts_at: '2026-10-27T09:00:00-03:00', ends_at: '2026-10-27T12:00:00-03:00' })],
      slots: [
        slotWith('ea', 'r1'),
        slotWith('ea', 'r5'),
        slotWith('eb', 'r1', 'p3', 'proposed'),
        slotWith('eb', 'r5', 'p17', 'proposed'),
        slotWith('ec', 'r1', 'p4', 'proposed'),
        slotWith('ec', 'r2', 'p9', 'confirmed', { warnings: ['overlap'], override: true }),
      ],
    });
    await page(remote);
    await user.click(await screen.findByRole('button', { name: 'Publicar' }));
    const summary = await screen.findByRole('list', { name: 'Resumo da publicação' });
    expect(summary).toHaveTextContent('2 vagas abertas');
    expect(summary).toHaveTextContent('3 propostas pendentes');
    expect(summary).toHaveTextContent('1 alerta de conflito');
  });

  it('UT-109 semana sem nenhuma alocação pede uma segunda confirmação antes de publicar', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1'), slotWith('ea', 'r5')] });
    remote.rpcHandler = (fn) => (fn === 'publish_week' ? { revision: 1, notified: 0 } : {});
    await page(remote);
    await user.click(await screen.findByRole('button', { name: 'Publicar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publicar a semana' });
    await user.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A semana não tem nenhuma pessoa escalada');
    expect(remote.rpcCalls.filter((c) => c.fn === 'publish_week')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Publicar sem ninguém escalado' }));
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'publish_week', args: { week_id: 'w-b', expected_revision: 0 } }));
  });

  it('UT-115 semana publicada com 4 diferenças mostra o destaque fixo "4 alterações não publicadas"', async () => {
    const a = slotWith('ea', 'r1', 'p4');
    const b = slotWith('ea', 'r5');
    const c = slotWith('eb', 'r1', 'p5');
    const added = slotWith('eb', 'r5');
    const snap = (s: { slot: { id: string; event_id: unknown; job_role_id: unknown } }, person: string | null, notes: string | null = null) =>
      row(`pub-${s.slot.id}`, { week_id: 'w-b', revision: 1, event_id: s.slot.event_id, slot_id: s.slot.id, job_role_id: s.slot.job_role_id, person_id: person, notes });
    const remote = weekRemote({
      week: { state: 'published', revision: 1, published_at: '2026-10-20T20:00:00.000Z', published_by: 'p1', dirty_since: '2026-10-21T13:00:00.000Z' },
      // A observação do evento eb mudou depois da publicação.
      events: [AULA, { ...TARDE, notes: 'Levar o teleprompter' }],
      slots: [a, b, c, added],
      // Fotografia: P3 na vaga a (agora P4), P17 na vaga b (agora aberta), P5 na vaga c (igual); a vaga "added" é nova.
      published: [snap(a, 'p3'), snap(b, 'p17'), snap(c, 'p5')],
    });
    await page(remote);
    const banner = await screen.findByRole('region', { name: 'Alterações não publicadas' });
    expect(banner).toHaveTextContent('4 alterações não publicadas');
    expect(within(banner).getByRole('button', { name: 'Publicar alterações' })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Descartar alterações' })).toBeInTheDocument();
  });
});
