import { addDays } from '@cronograma/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { row } from '../../test/catalogRows';
import { FakeRemote } from '../../test/fakeRemote';
import { PERF_BUDGET, renderWithSync } from '../../test/helpers';
import { CREW_ROWS, eventRow, NOW, peopleRows, personRoleRows, ROLE_ROWS, slotWith, SOURCES, TYPE_ROWS, WEEK_B, weekRemote } from '../../test/weekFixtures';
import type { CrewRow, EventRow, JobRoleRow, PersonRoleRow, PersonRow, ServiceTypeRow } from '../data/catalog';
import { LocalStore } from '../sync/localStore';
import { SyncEngine } from '../sync/syncEngine';
import { SyncProvider } from '../sync/SyncProvider';
import type { WeekRows } from './model';
import { NO_EVENTS } from './PreviewPage';
import { WeekBoard } from './WeekBoard';
import { WeekPage } from './WeekPage';

beforeEach(() => {
  // Só o relógio: hoje é 21/10, e a semana B (26/10) fica futura, como na semente.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const AULA = eventRow('ea', { title: 'Gravação aula Biologia\nProfessora: Ana' });
const TARDE = eventRow('eb', { title: 'Gravação aula Química', starts_at: '2026-10-26T14:00:00-03:00', ends_at: '2026-10-26T17:00:00-03:00' });

/** Abre a semana e espera a primeira leitura completa da cópia local. */
async function page(remote: FakeRemote, date = WEEK_B) {
  const view = renderWithSync(<WeekPage params={{ date }} />, { remote });
  await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  return view;
}

const ops = (remote: FakeRemote) => remote.applyCalls.flat();
const card = (name: string) => screen.findByRole('article', { name });
const chips = (el: HTMLElement) => within(el).getAllByRole('button').filter((b) => b.className.includes('board-chip-main'));

describe('Semana: grade', () => {
  it('o topo mostra "< Semana de 26/10 >" com as semanas vizinhas dos lados, e as setas trocam de semana', async () => {
    const user = userEvent.setup();
    await page(weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1')] }));
    const nav = await screen.findByRole('navigation', { name: 'Trocar de semana' });
    expect(within(nav).getByRole('heading', { level: 1 })).toHaveTextContent('SEMANA DE 26/10');
    expect(nav).toHaveTextContent('Semana de 19/10');
    expect(nav).toHaveTextContent('Semana de 02/11');
    expect(nav).toHaveTextContent('Próxima semana');
    await user.click(within(nav).getByRole('button', { name: 'Próxima semana' }));
    expect(window.location.hash).toBe('#/semana/2026-11-02');
    await user.click(within(nav).getByRole('button', { name: 'Semana anterior' }));
    expect(window.location.hash).toBe('#/semana/2026-10-19');
  });

  it('uma coluna por dia, cartão completo por atividade e, no fim do dia, a linha fina do que não pede equipe; sem Assistente nem Propor escala', async () => {
    const reserva = eventRow('er', { title: 'Não marcar nada', service_type_id: 't4', starts_at: '2026-10-26T08:00:00-03:00', ends_at: '2026-10-26T09:00:00-03:00' });
    await page(weekRemote({ events: [reserva, AULA], slots: [slotWith('ea', 'r1', 'p17')] }));
    const day = await screen.findByRole('region', { name: 'segunda, 26/10' });
    const aula = await within(day).findByRole('article', { name: 'Gravação aula Biologia' });
    // Só a primeira linha do título; tipo, horário, local e a cor da família (aula).
    expect(aula).toHaveClass('board-kind--aula');
    expect(aula).toHaveTextContent('09:00 às 12:00 · Estúdio 1');
    expect(within(aula).getByRole('button', { name: 'Câmera: Pessoa Exemplo 17' })).toBeInTheDocument();
    expect(within(day).getByRole('button', { name: 'Não marcar nada, 08:00 às 09:00' })).toHaveClass('board-line');
    // Dia sem nada vira uma coluna estreita.
    expect(screen.getByRole('region', { name: 'terça, 27/10' })).toHaveClass('is-empty');
    for (const name of [/Assistente/, 'Propor escala', 'Montar semana']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Pessoas disponíveis por função' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nova atividade interna' })).toBeInTheDocument();
  });

  it('semana futura: a vaga aberta já vem com a sugestão tracejada, e Confirmar grava a pessoa', async () => {
    const user = userEvent.setup();
    const open = slotWith('ea', 'r1');
    const remote = weekRemote({ events: [AULA], slots: [open] });
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    const chip = await within(aula).findByRole('button', { name: /^Câmera: .+ \(sugestão\)$/ });
    expect(chip.closest('li')).toHaveClass('is-suggested');
    expect(chip).toHaveAttribute('title', expect.stringContaining('Sugestão: nunca fez neste tipo'));
    expect(ops(remote).some((o) => o.kind === 'assignment.set')).toBe(false);

    await user.click(chip);
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Confirmar' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'assignment.set')).toMatchObject({ payload: { slot_id: open.slot.id, override: false } }));
  });

  it('fora do horário de trabalho: ainda é sugerida, com o alerta; Confirmar escala mesmo assim', async () => {
    const user = userEvent.setup();
    const open = slotWith('ea', 'r1');
    // P3 e P4 têm a Câmera; com P4 inativa, só sobra P3, que só trabalha à tarde na segunda (a aula é de manhã).
    const people = peopleRows(4, { p3: { work_hours: { '1': ['13:00', '18:00'] } }, p4: { active: false } });
    const remote = weekRemote({ events: [AULA], slots: [open], people, personRoles: personRoleRows(4) });
    await page(remote);
    const chip = await within(await card('Gravação aula Biologia')).findByRole('button', { name: 'Câmera: Pessoa Exemplo 03 (sugestão)' });
    expect(chip).toHaveAttribute('title', expect.stringContaining('fora do horário de trabalho'));
    expect(within(chip).getByText('alerta')).toBeInTheDocument();
    await user.click(chip);
    await user.click(screen.getByRole('menuitem', { name: 'Confirmar' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'assignment.set')).toMatchObject({ payload: { slot_id: open.slot.id, person_id: 'p3', override: true } }));
  });

  it('pessoa de São Paulo não é sugerida em tipo externo', async () => {
    const types = TYPE_ROWS.map((t) => (t.id === 't1' ? { ...t, external: true } : t));
    const people = peopleRows(4, { p3: { base: 'sao_paulo' }, p4: { base: 'piracicaba' } });
    await page(weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1')], people, personRoles: personRoleRows(4), extra: { service_types: types } }));
    expect(await within(await card('Gravação aula Biologia')).findByRole('button', { name: 'Câmera: Pessoa Exemplo 04 (sugestão)' })).toBeInTheDocument();
  });

  it('"Deixar vaga" tira a sugestão: a ficha fica vermelha, aberta', async () => {
    const user = userEvent.setup();
    await page(weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1')] }));
    const aula = await card('Gravação aula Biologia');
    await user.click(await within(aula).findByRole('button', { name: /\(sugestão\)$/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Deixar vaga' }));
    const chip = within(aula).getByRole('button', { name: 'Câmera: vaga aberta' });
    expect(chip.closest('li')).toHaveClass('is-open');
  });

  it('"+ vaga" põe uma vaga da função escolhida; "Tirar esta vaga" tira, mesmo com gente, e a vaga aberta sai pela lista', async () => {
    const user = userEvent.setup();
    const filled = slotWith('ea', 'r1', 'p3');
    // Ninguém de P1 a P13 tem Mediação: a vaga fica aberta, sem sugestão.
    const open = slotWith('ea', 'r4');
    const remote = weekRemote({ events: [AULA], slots: [filled, open], people: peopleRows(13), personRoles: personRoleRows(13) });
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    await user.click(within(aula).getByRole('button', { name: 'Pôr mais uma vaga em Gravação aula Biologia' }));
    // As funções que o evento já tem vêm primeiro.
    const menu = within(screen.getByRole('menu', { name: 'Função da vaga a mais em Gravação aula Biologia' }));
    expect(menu.getAllByRole('menuitem').slice(0, 2).map((b) => b.textContent)).toEqual(['Câmera', 'Mediação']);
    await user.click(menu.getByRole('menuitem', { name: 'Mediação' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'slot.add')).toMatchObject({ payload: { event_id: 'ea', job_role_id: 'r4' }, baseVersion: null }));

    await user.click(within(aula).getByRole('button', { name: 'Câmera: Pessoa Exemplo 03' }));
    await user.click(screen.getByRole('menuitem', { name: 'Tirar esta vaga' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'slot.remove')).toMatchObject({ payload: { id: filled.slot.id } }));

    // A vaga de Mediação posta acima também aparece, aberta como a que já existia.
    await user.click(within(aula).getAllByRole('button', { name: 'Mediação: vaga aberta' })[0] as HTMLElement);
    await user.click(await screen.findByRole('button', { name: 'Tirar esta vaga' }));
    await waitFor(() => expect(ops(remote).filter((o) => o.kind === 'slot.remove')).toHaveLength(2));
    expect((ops(remote).filter((o) => o.kind === 'slot.remove')[1]?.payload as { id: string }).id).not.toBe(filled.slot.id);

    // O "−" na própria ficha tira a vaga aberta sem abrir nada.
    await user.click(within(aula).getAllByRole('button', { name: 'Tirar a vaga de Mediação (vaga aberta)' })[0] as HTMLElement);
    await waitFor(() => expect(ops(remote).filter((o) => o.kind === 'slot.remove')).toHaveLength(3));
  });

  it('"virou o titular?": a mesma troca nas duas últimas vezes pergunta no cartão; "Sim" grava a turma fixa (titular e reserva)', async () => {
    const user = userEvent.setup();
    const fact = (person: string, week: string) => ({ event_id: `h${person}${week}`, week_start: week, event_date: week, title: 'Gravação aula Biologia', service_type_id: 't1', service_type_name: 'T1', job_role_id: 'r1', job_role_name: 'Câmera', person_id: person, person_name: person, raw_name: null, hours: 3, source: 'platform' });
    const remote = weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1')] });
    remote.views = { ...remote.views, history_facts: [...['2026-09-14', '2026-09-21', '2026-09-28'].map((w) => fact('p3', w)), fact('p4', '2026-10-12'), fact('p4', '2026-10-19')] };
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    const ask = await within(aula).findByRole('group', { name: 'Pessoa Exemplo 04 virou titular de Câmera?' });
    expect(ask).toHaveTextContent('no lugar de Pessoa Exemplo 03');
    await user.click(within(ask).getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'set_series_titular', args: { p_series: 'gravacao biologia', p_role: 'r1', p_people: ['p4', 'p3'] } }));
    expect(within(aula).queryByRole('group', { name: /virou titular/ })).toBeNull();
  });

  it('"Só o que precisa de olho" apaga os cartões sem pendência e conta os que precisam; "Próximo" leva ao cartão', async () => {
    const user = userEvent.setup();
    // Biologia tem sugestão limpa e série conhecida; Química só tem vaga de Mediação, que ninguém de P1 a P13 faz.
    const fact = { event_id: 'h1', week_start: '2026-10-19', event_date: '2026-10-19', title: 'Gravação aula Biologia', service_type_id: 't1', service_type_name: 'T1', job_role_id: 'r1', job_role_name: 'Câmera', person_id: 'p3', person_name: 'p3', raw_name: null, hours: 3, source: 'platform' };
    const quimica = { ...fact, event_id: 'h2', title: 'Gravação aula Química' };
    const remote = weekRemote({ events: [AULA, TARDE], slots: [slotWith('ea', 'r1'), slotWith('eb', 'r4')], people: peopleRows(13), personRoles: personRoleRows(13) });
    remote.views = { ...remote.views, history_facts: [fact, quimica] };
    await page(remote);
    const review = await screen.findByRole('group', { name: 'Revisão' });
    await waitFor(() => expect(review).toHaveTextContent('1 para revisar'));
    await user.click(within(review).getByRole('button', { name: 'Só o que precisa de olho' }));
    expect(await card('Gravação aula Biologia')).toHaveClass('is-dim');
    const quimicaCard = await card('Gravação aula Química');
    expect(quimicaCard).not.toHaveClass('is-dim');
    expect(quimicaCard).toHaveTextContent('Para revisar: vaga sem sugestão');
    // O jsdom não rola a tela.
    Element.prototype.scrollIntoView = vi.fn();
    await user.click(within(review).getByRole('button', { name: 'Próximo' }));
    expect(document.activeElement?.closest('article')).toBe(quimicaCard);
  });

  it('"Confirmar sugestões (N)" grava as sugestões e aceita as propostas do serviço de fundo; o placar conta cada situação', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [AULA, TARDE], slots: [slotWith('ea', 'r1'), slotWith('ea', 'r5', 'p17', 'proposed'), slotWith('eb', 'r1', 'p3')] });
    await page(remote);
    const score = await screen.findByLabelText('Placar da semana');
    await waitFor(() => expect(score).toHaveTextContent('1 confirmada2 sugestões0 abertas0 avisos'));
    await user.click(screen.getByRole('button', { name: 'Confirmar sugestões (2)' }));
    await waitFor(() => {
      const kinds = ops(remote).map((o) => o.kind);
      expect(kinds).toContain('assignment.set');
      expect(kinds).toContain('assignment.accept');
    });
  });

  it('a proposta do serviço de fundo aparece tracejada com o motivo; Trocar pessoa lista os aptos na ordem do ranking (UT-163)', async () => {
    const user = userEvent.setup();
    const proposed = slotWith('ea', 'r1', 'p6', 'proposed', { reason: 'costuma fazer gravação de aula' });
    const remote = weekRemote({ events: [AULA, TARDE], slots: [proposed, slotWith('eb', 'r1', 'p3')] });
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    const chip = await within(aula).findByRole('button', { name: 'Câmera: Pessoa Exemplo 06 (proposta)' });
    expect(chip).toHaveAttribute('title', expect.stringContaining('Proposta: costuma fazer gravação de aula'));
    await user.click(chip);
    await user.click(screen.getByRole('menuitem', { name: 'Trocar pessoa' }));
    const apt = await screen.findByRole('list', { name: 'Aptos' });
    const names = within(apt).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    // Sem histórico, todos empatam: menor carga primeiro e depois o código (P4, P5, P7, P8, P18); P3 já tem 3 h.
    expect(names).toEqual(['Pessoa Exemplo 04', 'Pessoa Exemplo 05', 'Pessoa Exemplo 07', 'Pessoa Exemplo 08', 'Pessoa Exemplo 18', 'Pessoa Exemplo 03']);
    expect(within(apt).getByRole('button', { name: 'Pessoa Exemplo 03' })).toHaveTextContent('nunca fez neste tipo. 3 h e 1 atividade na semana');

    // A busca filtra pelo começo do nome.
    await user.type(screen.getByRole('searchbox', { name: 'Buscar pelo nome' }), 'exemplo 1');
    expect(within(screen.getByRole('list', { name: 'Aptos' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Pessoa Exemplo 18']);
    await user.click(within(screen.getByRole('list', { name: 'Aptos' })).getByRole('button', { name: 'Pessoa Exemplo 18' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'assignment.set')?.payload).toEqual({ slot_id: proposed.slot.id, person_id: 'p18', override: false }));
  });

  it('UT-110 pessoa com over_limit mostra o alerta e só envia assignment.set com override depois de "Escalar mesmo assim"', async () => {
    const user = userEvent.setup();
    const open = slotWith('ea', 'r1');
    const remote = weekRemote({ events: [AULA, TARDE], slots: [open, slotWith('eb', 'r1', 'p3')], people: peopleRows(20, { p3: { weekly_limit_hours: 4 } }) });
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    await user.click(await within(aula).findByRole('button', { name: /\(sugestão\)$/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Trocar pessoa' }));
    const p3 = within(await screen.findByRole('list', { name: 'Outras pessoas' })).getByRole('button', { name: 'Pessoa Exemplo 03' });
    expect(p3).toHaveTextContent('passa do limite semanal');
    await user.click(p3);
    expect(await screen.findByRole('alert')).toHaveTextContent('Pessoa Exemplo 03: passa do limite semanal');
    expect(ops(remote).some((o) => o.kind === 'assignment.set')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Escalar mesmo assim' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'assignment.set')).toMatchObject({ payload: { slot_id: open.slot.id, person_id: 'p3', override: true }, baseVersion: 1 }));
  });

  it('UT-165 a lista de pessoas não mostra pessoas inativas', async () => {
    const user = userEvent.setup();
    await page(weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1')], people: peopleRows(20, { p5: { active: false } }) }));
    await user.click(await within(await card('Gravação aula Biologia')).findByRole('button', { name: /\(sugestão\)$/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Trocar pessoa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escalar' });
    expect(within(dialog).getByRole('button', { name: 'Pessoa Exemplo 04' })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Pessoa Exemplo 05');
  });

  it('UT-161 vaga sem nenhum apto fica aberta, vermelha, sem sugestão', async () => {
    // Ninguém de P1 a P13 tem a função R4 (Mediação).
    await page(weekRemote({ events: [AULA], slots: [slotWith('ea', 'r4')], people: peopleRows(13), personRoles: personRoleRows(13) }));
    const chip = await within(await card('Gravação aula Biologia')).findByRole('button', { name: 'Mediação: vaga aberta' });
    expect(chip.closest('li')).toHaveClass('is-open');
    expect(chip).toHaveAttribute('title', expect.stringContaining('Ninguém apto'));
    expect(await screen.findByLabelText('Placar da semana')).toHaveTextContent('1 aberta');
  });

  it('semana atual: sem sugestões automáticas, a vaga aberta abre a lista ordenada', async () => {
    const user = userEvent.setup();
    const now = eventRow('en', { title: 'Gravação aula Física', week_start: '2026-10-19', starts_at: '2026-10-22T09:00:00-03:00', ends_at: '2026-10-22T12:00:00-03:00' });
    await page(weekRemote({ week: { week_start: '2026-10-19' }, events: [now], slots: [slotWith('en', 'r1')] }), '2026-10-19');
    const chip = await within(await card('Gravação aula Física')).findByRole('button', { name: 'Câmera: vaga aberta' });
    expect(screen.queryByRole('button', { name: /Confirmar sugestões/ })).toBeNull();
    await user.click(chip);
    expect(await screen.findByRole('dialog', { name: 'Escalar' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Aptos' })).toBeInTheDocument();
  });

  it('folga da agenda: aparece no topo do dia, a pessoa não é sugerida; desmarcar a folga a devolve à sugestão', async () => {
    const user = userEvent.setup();
    const ferias = eventRow('ef', { title: 'Férias Carla', service_type_id: 't4', all_day: true, starts_at: '2026-10-26T00:00:00-03:00', ends_at: '2026-10-31T00:00:00-03:00' });
    // P3 e P4 têm a função R1; com P3 inativa, só a Carla (P4) faria a vaga de Câmera.
    const remote = weekRemote({ events: [AULA, ferias], slots: [slotWith('ea', 'r1')], people: peopleRows(4, { p3: { active: false }, p4: { name: 'Carla Mendes' } }), personRoles: personRoleRows(4) });
    await page(remote);
    const day = await screen.findByRole('region', { name: 'segunda, 26/10' });
    const off = within(day).getByLabelText('Fora no dia');
    expect(off).toHaveTextContent('Fora:Carla Mendes (férias)');
    const aula = await card('Gravação aula Biologia');
    expect(within(aula).queryByRole('button', { name: /Carla Mendes/ })).toBeNull();

    await user.click(within(off).getByRole('button', { name: 'Carla Mendes (férias)' }));
    expect(await within(aula).findByRole('button', { name: 'Câmera: Carla Mendes (sugestão)' })).toBeInTheDocument();
  });

  it('passar o mouse numa ficha acende a mesma pessoa na semana e mostra as horas dela', async () => {
    await page(weekRemote({ events: [AULA, TARDE], slots: [slotWith('ea', 'r1', 'p17'), slotWith('eb', 'r1', 'p17'), slotWith('eb', 'r5', 'p9')] }));
    const aula = await card('Gravação aula Biologia');
    fireEvent.mouseEnter(within(aula).getByRole('button', { name: 'Câmera: Pessoa Exemplo 17' }).closest('li') as HTMLElement);
    const tarde = await card('Gravação aula Química');
    expect(within(tarde).getByRole('button', { name: 'Câmera: Pessoa Exemplo 17' }).closest('li')).toHaveClass('is-lit');
    expect(chips(tarde).find((b) => b.getAttribute('aria-label')?.includes('09'))?.closest('li')).not.toHaveClass('is-lit');
    expect(screen.getByText('Pessoa Exemplo 17: 6 h e 2 atividades na semana')).toHaveClass('board-lit');
  });

  it('a estrela do painel destaca a atividade principal da semana; o cartão mostra a marca', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [AULA, { ...TARDE, highlighted: true }], slots: [slotWith('ea', 'r1', 'p17')] });
    await page(remote);
    expect(within(await card('Gravação aula Química')).getByRole('img', { name: 'Atividade principal' })).toBeInTheDocument();
    await user.click(within(await card('Gravação aula Biologia')).getByRole('button', { name: 'Gravação aula Biologia' }));
    await user.click(await screen.findByRole('button', { name: 'Destacar Gravação aula Biologia como atividade principal' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'event.update_extras')).toMatchObject({ payload: { id: 'ea', highlighted: true } }));
  });

  it('clicar no cartão abre os detalhes à direita, e trocar o tipo ali vai pela fila', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1', 'p17')] });
    await page(remote);
    await user.click(within(await card('Gravação aula Biologia')).getByRole('button', { name: 'Gravação aula Biologia' }));
    const panel = await screen.findByRole('complementary', { name: 'Detalhes de Gravação aula Biologia' });
    expect(panel).toHaveTextContent('segunda, 26/10, 09:00 às 12:00');
    await user.selectOptions(within(panel).getByLabelText('Tipo de serviço de Gravação aula Biologia'), 't2');
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'event.update_extras')).toMatchObject({ payload: { id: 'ea', service_type_id: 't2' } }));
    await user.click(within(panel).getByRole('button', { name: 'Fechar os detalhes' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('o painel mostra as vagas como fichas: tirar, pôr mais uma e escolher a pessoa, como no cartão', async () => {
    const user = userEvent.setup();
    const filled = slotWith('ea', 'r1', 'p17');
    const remote = weekRemote({ events: [AULA], slots: [filled] });
    await page(remote);
    await user.click(within(await card('Gravação aula Biologia')).getByRole('button', { name: 'Gravação aula Biologia' }));
    const panel = await screen.findByRole('complementary', { name: 'Detalhes de Gravação aula Biologia' });
    const crew = within(panel).getByRole('list', { name: 'Vagas de Gravação aula Biologia no painel' });
    expect(within(crew).getByRole('button', { name: /^Câmera:/ })).toBeInTheDocument();

    await user.click(within(crew).getByRole('button', { name: 'Pôr mais uma vaga em Gravação aula Biologia' }));
    await user.click(within(screen.getByRole('menu', { name: 'Função da vaga a mais em Gravação aula Biologia' })).getByRole('menuitem', { name: 'Mediação' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'slot.add')).toMatchObject({ payload: { event_id: 'ea', job_role_id: 'r4' } }));

    await user.click(within(crew).getByRole('button', { name: /^Tirar a vaga de Câmera/ }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'slot.remove')).toMatchObject({ payload: { id: filled.slot.id } }));
  });
});

describe('Semana: cores do Google Agenda', () => {
  it('o cartão leva a cor própria do evento no Google; sem ela, a do tipo (fora da lista, o lilás da agenda)', async () => {
    const colored = eventRow('ec', { title: 'Evento externo', service_type_id: 't2', color_id: '11' });
    await page(weekRemote({ events: [AULA, colored], slots: [slotWith('ea', 'r1')] }));
    expect(await card('Evento externo')).toHaveAttribute('data-color', '#c05b3f');
    expect(await card('Gravação aula Biologia')).toHaveAttribute('data-color', '#9b7cad');
  });
});

describe('Semana: linha do tempo', () => {
  it('mostra um dia por vez, com os cartões na altura do horário; os dias trocam e a escolha fica lembrada', async () => {
    const user = userEvent.setup();
    const terca = eventRow('ec', { title: 'Evento externo', service_type_id: 't2', starts_at: '2026-10-27T09:00:00-03:00', ends_at: '2026-10-27T12:00:00-03:00' });
    try {
      await page(weekRemote({ events: [AULA, TARDE, terca], slots: [slotWith('ea', 'r1'), slotWith('eb', 'r1'), slotWith('ec', 'r1')] }));
      await card('Gravação aula Biologia');
      await user.click(screen.getByRole('button', { name: 'Linha do tempo' }));
      // Abre no primeiro dia com atividade (a semana não é a de hoje): a segunda, sem a terça.
      const day = await screen.findByRole('region', { name: 'segunda, 26/10' });
      const items = [...day.querySelectorAll<HTMLElement>('.board-timeline-item')];
      expect(items.map((el) => within(el).getByRole('article').getAttribute('aria-label'))).toEqual(['Gravação aula Biologia', 'Gravação aula Química']);
      // 9h a 12h numa grade que começa às 7h: duas horas abaixo do topo, três de altura.
      expect(items[0]?.style.top).toBe('192px');
      expect(items[0]?.style.getPropertyValue('--h')).toBe('284px');
      expect(screen.queryByRole('article', { name: 'Evento externo' })).toBeNull();
      // As fichas da vaga funcionam como na grade.
      expect(within(items[0] as HTMLElement).getByRole('button', { name: /^Câmera:/ })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Próximo dia' }));
      expect(await card('Evento externo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^terça, 27\/10/ })).toHaveAttribute('aria-current', 'date');
      expect(localStorage.getItem('semana.visao')).toBe('timeline');
    } finally {
      localStorage.removeItem('semana.visao');
    }
  });
});

describe('Semana sem montagem', () => {
  it('as vagas previstas pela equipe do tipo já aparecem com sugestão; confirmar monta a semana sozinho', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ week: null, events: [eventRow('b1', { title: 'Gravação aula Biologia' })] });
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    // T1: 1 Câmera e 1 Técnico de aula.
    await waitFor(() => expect(chips(aula)).toHaveLength(2));
    expect(screen.getByText('Escolha as pessoas: a semana é montada sozinha na primeira confirmação.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Confirmar sugestões (2)' }));
    await waitFor(() => expect(ops(remote).some((o) => o.kind === 'week.build')).toBe(true));
    // Enquanto a montagem não chega, a escolha fica na ficha, a enviar.
    expect(within(aula).getAllByText('a enviar')).toHaveLength(2);
  });

  it('tipo com porte: vale Simples sem escolha, e trocar o porte no painel muda as vagas previstas e vai pela fila', async () => {
    const user = userEvent.setup();
    const types = TYPE_ROWS.map((t) => (t.id === 't1' ? { ...t, sized: true } : t));
    const crew = [
      ...CREW_ROWS.filter((c) => c.service_type_id !== 't1'),
      row('t1:s1', { service_type_id: 't1', job_role_id: 'r1', quantity: 1, size: 1, archived_at: null }),
      row('t1:s2', { service_type_id: 't1', job_role_id: 'r1', quantity: 2, size: 2, archived_at: null }),
      row('t1:s3', { service_type_id: 't1', job_role_id: 'r1', quantity: 4, size: 3, archived_at: null }),
    ];
    const remote = weekRemote({ week: null, events: [eventRow('b1', { title: 'Gravação aula Biologia' })], extra: { service_types: types, service_type_crew: crew } });
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    expect(aula).toHaveTextContent('· Simples');
    await waitFor(() => expect(chips(aula)).toHaveLength(1));
    await user.click(within(aula).getByRole('button', { name: 'Gravação aula Biologia' }));
    const panel = await screen.findByRole('complementary');
    await user.click(within(panel).getByRole('button', { name: 'Grande' }));
    await waitFor(() => expect(chips(aula)).toHaveLength(4));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'event.update_extras')).toMatchObject({ payload: { id: 'b1', size: 3 } }));
  });

  it('semana sem montagem: as vagas que a série aprendeu valem, com "pela série"; tirar uma vaga prevista a some e monta a semana', async () => {
    const user = userEvent.setup();
    const rule = row('sr1', { series: 'gravacao biologia', service_type_id: null, crew: [{ job_role_id: 'r1', quantity: 2 }, { job_role_id: 'r4', quantity: 1 }], crew_type_id: 't1', size: null });
    const remote = weekRemote({ week: null, events: [eventRow('b1', { title: 'Gravação aula Biologia' })], extra: { series_rules: [rule] } });
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    await waitFor(() => expect(chips(aula).map((b) => b.getAttribute('aria-label')?.split(':')[0])).toEqual(['Câmera', 'Câmera', 'Mediação']));
    expect(aula).toHaveTextContent('pela série');

    // Com a sugestão, a ficha abre o menu.
    await user.click(await within(aula).findByRole('button', { name: /^Mediação: .+ \(sugestão\)$/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Tirar esta vaga' }));
    await waitFor(() => expect(chips(aula)).toHaveLength(2));
    await waitFor(() => expect(ops(remote).some((o) => o.kind === 'week.build')).toBe(true));
  });

  it('semana sem montagem: o porte sugerido pela série no histórico já vale e vai na montagem', async () => {
    const user = userEvent.setup();
    const types = TYPE_ROWS.map((t) => (t.id === 't1' ? { ...t, sized: true, default_size: 1 } : t));
    const crew = [
      ...CREW_ROWS.filter((c) => c.service_type_id !== 't1'),
      row('t1:s1', { service_type_id: 't1', job_role_id: 'r1', quantity: 1, size: 1, archived_at: null }),
      row('t1:s2', { service_type_id: 't1', job_role_id: 'r1', quantity: 2, size: 2, archived_at: null }),
      row('t1:s3', { service_type_id: 't1', job_role_id: 'r1', quantity: 4, size: 3, archived_at: null }),
    ];
    // As últimas vezes da série tiveram 2 pessoas: porte Médio.
    const history = ['2026-10-12', '2026-10-19'].flatMap((w, i) =>
      ['p3', 'p4'].map((p) => ({ event_id: `h${i}`, week_start: w, event_date: w, title: 'Gravação aula Biologia', service_type_id: 't1', service_type_name: 'T1', job_role_id: 'r1', job_role_name: 'Câmera', person_id: p, person_name: p, raw_name: null, hours: 3, source: 'import' })),
    );
    const remote = weekRemote({ week: null, events: [eventRow('b1', { title: 'Gravação aula Biologia' })], extra: { service_types: types, service_type_crew: crew } });
    remote.views = { ...remote.views, history_facts: history };
    await page(remote);
    const aula = await card('Gravação aula Biologia');
    await waitFor(() => expect(aula).toHaveTextContent('· Médio · pela série'));
    await waitFor(() => expect(chips(aula)).toHaveLength(2));
    await user.click(await screen.findByRole('button', { name: /Confirmar sugestões/ }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'week.build')).toMatchObject({ payload: { sizes: { b1: 2 } } }));
  });

  it('evento sem tipo: cartão com aviso e a sugestão de tipo; sem tipo, sem vagas', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ week: null, events: [eventRow('b2', { title: 'Gravação aula Física', service_type_id: null, type_certainty: null })] });
    await page(remote);
    const aula = await card('Gravação aula Física');
    expect(aula).toHaveTextContent('Tipo a definir');
    expect(aula).toHaveTextContent('Escolha o tipo para ver as vagas.');
    expect(within(aula).getByRole('img', { name: /tipo de serviço a definir/ })).toBeInTheDocument();
    expect(screen.getByText(/1 atividade está sem tipo de serviço/)).toBeInTheDocument();
    await user.click(await within(aula).findByRole('button', { name: /^Usar .+ em Gravação aula Física$/ }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'event.update_extras')).toMatchObject({ payload: { id: 'b2' } }));
  });

  it('UT-155 semana sem eventos mostra "Nenhum evento nesta semana"', async () => {
    await page(weekRemote({ week: null, events: [] }));
    expect(await screen.findByText(`${NO_EVENTS}.`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Montar semana' })).toBeNull();
  });

  it('UT-158 origem com erro mostra "Agenda X desconectada desde dd/mm hh:mm" com os últimos dados', async () => {
    const broken = row('S2', { google_calendar_id: 'audiovisualpecege@gmail.com', label: 'audiovisualpecege', enabled: true, status: 'error', last_synced_at: '2026-10-20T13:30:00.000Z', last_error: 'Sem acesso à agenda' });
    await page(weekRemote({ week: null, events: [eventRow('b3', { title: 'Gravação aula Física', calendar_source_id: 'S2' })], extra: { calendar_sources: [SOURCES[0] as never, broken] } }));
    expect(await screen.findByText(/Agenda audiovisualpecege desconectada desde 20\/10 10:30/)).toBeInTheDocument();
    expect(await card('Gravação aula Física')).toBeInTheDocument();
  });

  it('UT-157 grade com 120 eventos aparece por dia e renderiza em menos de 500 ms', () => {
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
    const engine = new SyncEngine({ store: new LocalStore('grade'), remote: new FakeRemote(), profile: 'admin', online: false });
    const board = (r: WeekRows) => (
      <SyncProvider engine={engine}>
        <WeekBoard rows={r} now={NOW} today="2026-10-21" historyRows={[]} historyLoading={false} onOpenEvent={() => undefined} renderBar={() => null} />
      </SyncProvider>
    );
    // Uma grade de um evento antes, para o tempo medido ser o da semana grande e não o da primeira carga do código
    // no jsdom (que o navegador, com o React de produção, não tem).
    render(board({ ...rows, events: events.slice(0, 1) })).unmount();
    const started = performance.now();
    render(board(rows));
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(500 * PERF_BUDGET);
    const days = screen.getAllByRole('region').filter((r) => !r.classList.contains('is-empty'));
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual(['segunda, 26/10', 'terça, 27/10', 'quarta, 28/10', 'quinta, 29/10', 'sexta, 30/10', 'sábado, 31/10']);
    expect(within(days[0] as HTMLElement).getAllByRole('article')).toHaveLength(20);
  });
});

describe('Semana: publicação', () => {
  it('UT-109 o diálogo de publicar mostra sugestões não confirmadas, vagas abertas, propostas pendentes e alertas', async () => {
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
    expect(summary).toHaveTextContent('2 sugestões não confirmadas');
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
    expect(await within(dialog).findByText(/A semana não tem nenhuma pessoa escalada/)).toBeInTheDocument();
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
      events: [AULA, { ...TARDE, notes: 'Levar o teleprompter' }],
      slots: [a, b, c, added],
      published: [snap(a, 'p3'), snap(b, 'p17'), snap(c, 'p5')],
    });
    await page(remote);
    const banner = await screen.findByRole('region', { name: 'Alterações não publicadas' });
    expect(banner).toHaveTextContent('4 alterações não publicadas');
    expect(within(banner).getByRole('button', { name: 'Publicar alterações' })).toBeInTheDocument();
  });
});
