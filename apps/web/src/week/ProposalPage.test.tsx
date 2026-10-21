import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithSync } from '../../test/helpers';
import { eventRow, NOW, slotWith, WEEK_B, weekRemote } from '../../test/weekFixtures';
import { RemoteError } from '../supabase';
import { ProposalPage } from './ProposalPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const AULA = eventRow('ea', { title: 'Gravação aula Biologia' });
const TARDE = eventRow('eb', { title: 'Gravação aula Química', starts_at: '2026-10-26T14:00:00-03:00', ends_at: '2026-10-26T17:00:00-03:00' });

async function page(remote: ReturnType<typeof weekRemote>) {
  const view = renderWithSync(<ProposalPage params={{ date: WEEK_B }} />, { remote });
  await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  return view;
}

const ops = (remote: ReturnType<typeof weekRemote>) => remote.applyCalls.flat();

describe('ProposalPage: passo 1, tipos de serviço', () => {
  it('evento sem tipo fica em destaque e segura o próximo passo; a sugestão do histórico preenche o tipo', async () => {
    const user = userEvent.setup();
    const sem = eventRow('ex', { title: 'Xpto especial', service_type_id: null, type_certainty: 'baixa', type_source: null });
    const remote = weekRemote({ events: [AULA, sem], slots: [slotWith('ea', 'r1')] });
    remote.views.history_facts = [
      { event_id: 'import:1', week_start: '2025-10-20', event_date: '2025-10-20', title: 'Xpto especial', service_type_id: 't2', service_type_name: 'Evento', job_role_id: null, job_role_name: null, person_id: null, person_name: null, raw_name: null, hours: 3, source: 'import' },
    ];
    await page(remote);

    const item = await screen.findByRole('listitem', { name: 'Xpto especial' });
    expect(item).toHaveClass('is-missing');
    expect(screen.getByRole('listitem', { name: 'Gravação aula Biologia' })).not.toHaveClass('is-missing');
    expect(screen.getByRole('status')).toHaveTextContent('1 de 2 eventos com tipo. 1 evento sem tipo está em destaque');
    expect(screen.getByRole('button', { name: 'Próximo passo' })).toBeDisabled();

    await user.click(await screen.findByRole('button', { name: 'Usar a sugestão do histórico' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'event.update_extras')).toMatchObject({ payload: { id: 'ex', service_type_id: 't2' } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Próximo passo' })).toBeEnabled());
  });

  it('ao chegar, identifica pela palavra-chave na hora e pede ao serviço de fundo os que sobraram', async () => {
    const porPalavra = eventRow('ek', { title: 'Revisão aula extra', service_type_id: null, type_certainty: 'baixa', type_source: null });
    const semPista = eventRow('ex', { title: 'Xpto especial', service_type_id: null, type_certainty: 'baixa', type_source: null });
    const remote = weekRemote({ events: [porPalavra, semPista] });
    remote.rpcHandler = (fn) => (fn === 'request_job' ? { job_id: 'job-c' } : {});
    await page(remote);
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'event.update_extras')).toMatchObject({ payload: { id: 'ek', service_type_id: 't1' } }));
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'request_job', args: { kind: 'classify', payload: {} } }));
    expect(await screen.findByText(/1 evento identificado pelas palavras-chave/)).toBeInTheDocument();
  });

  it('servidor sem a liberação do pedido mostra o aviso e deixa escolher à mão', async () => {
    const semPista = eventRow('ex', { title: 'Xpto especial', service_type_id: null, type_certainty: 'baixa', type_source: null });
    const remote = weekRemote({ events: [semPista] });
    remote.rpcHandler = (fn) => {
      if (fn === 'request_job') throw new RemoteError('forbidden', 'Este pedido não pode ser feito pelo aparelho.');
      return {};
    };
    await page(remote);
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não foi liberada no servidor');
    expect(screen.getByRole('button', { name: 'Trocar o tipo de Xpto especial' })).toBeInTheDocument();
  });

  it('o tipo aparece em negrito com o lápis; clicar no evento abre os detalhes numa janela, sem sair da tela', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [{ ...AULA, description: 'Professor: Ana<br>Sala 3' }], slots: [slotWith('ea', 'r1')] });
    await page(remote);
    const item = await screen.findByRole('listitem', { name: 'Gravação aula Biologia' });
    expect(within(item).getByText('Gravação de aula').tagName).toBe('STRONG');
    expect(within(item).getByRole('button', { name: 'Trocar o tipo de Gravação aula Biologia' })).toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Gravação aula Biologia' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gravação aula Biologia' });
    expect(dialog).toHaveTextContent('segunda, 26/10, 09:00 às 12:00');
    expect(dialog).toHaveTextContent('Professor: Ana');
    expect(dialog).not.toHaveTextContent('<br>');
    expect(window.location.hash).not.toBe('#/evento/ea');
  });

  it('"Só os sem tipo" filtra a lista; botão direito seleciona e "Definir tipo" vale para todos os selecionados', async () => {
    const user = userEvent.setup();
    const semA = eventRow('xa', { title: 'Xpto especial A', service_type_id: null, type_certainty: 'baixa', type_source: 'admin' });
    const semB = eventRow('xb', { title: 'Xpto especial B', service_type_id: null, type_certainty: 'baixa', type_source: 'admin' });
    const remote = weekRemote({ events: [AULA, semA, semB], slots: [slotWith('ea', 'r1')] });
    await page(remote);

    await user.click(await screen.findByRole('button', { name: 'Só os sem tipo (2)' }));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Gravação aula Biologia' })).toBeNull());
    const a = screen.getByRole('listitem', { name: 'Xpto especial A' });
    const b = screen.getByRole('listitem', { name: 'Xpto especial B' });

    await user.pointer({ keys: '[MouseRight]', target: a });
    await user.pointer({ keys: '[MouseRight]', target: b });
    expect(a).toHaveAttribute('data-selected', 'true');
    const bar = screen.getByRole('region', { name: 'Eventos selecionados' });
    expect(bar).toHaveTextContent('2 eventos selecionados');
    await user.selectOptions(within(bar).getByLabelText('Tipo para os selecionados'), 't2');
    await user.click(within(bar).getByRole('button', { name: 'Definir tipo' }));
    await waitFor(() =>
      expect(ops(remote).filter((o) => o.kind === 'event.update_extras').map((o) => o.payload)).toEqual([
        { id: 'xa', service_type_id: 't2' },
        { id: 'xb', service_type_id: 't2' },
      ]),
    );
    expect(screen.queryByRole('region', { name: 'Eventos selecionados' })).toBeNull();
  });

  it('semana sem montagem é montada ao seguir para o passo 2', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ week: null, events: [AULA] });
    await page(remote);
    await user.click(await screen.findByRole('button', { name: 'Próximo passo' }));
    await waitFor(() => expect(ops(remote).find((o) => o.kind === 'week.build')).toMatchObject({ payload: { week_start: WEEK_B } }));
  });
});

describe('ProposalPage: passo 2, pessoas', () => {
  it('UT-162 com propostas pendentes pergunta se substitui antes de pedir à IA; as aceitas não entram na conta', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({
      events: [AULA, TARDE],
      slots: [slotWith('ea', 'r1', 'p3', 'proposed'), slotWith('ea', 'r5', 'p17', 'proposed'), slotWith('eb', 'r1', 'p4', 'confirmed'), slotWith('eb', 'r5')],
    });
    remote.rpcHandler = (fn) => (fn === 'request_job' ? { job_id: 'job-1' } : {});
    await page(remote);
    await user.click(await screen.findByRole('button', { name: 'Próximo passo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Propor escala' });
    expect(dialog).toHaveTextContent('Substituir as 2 propostas pendentes?');
    expect(dialog).toHaveTextContent('As alocações aceitas não mudam.');
    expect(remote.rpcCalls).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'request_job', args: { kind: 'propose', payload: { week_id: 'w-b', replace_pending: true } } }));
  });

  it('sem propostas pendentes pede à IA na hora e mostra as vagas vazias em destaque', async () => {
    const user = userEvent.setup();
    const remote = weekRemote({ events: [AULA], slots: [slotWith('ea', 'r1'), slotWith('ea', 'r5', 'p17')] });
    remote.rpcHandler = (fn) => (fn === 'request_job' ? { job_id: 'job-2' } : {});
    await page(remote);
    await user.click(await screen.findByRole('button', { name: 'Próximo passo' }));
    await waitFor(() => expect(remote.rpcCalls).toContainEqual({ fn: 'request_job', args: { kind: 'propose', payload: { week_id: 'w-b', replace_pending: true } } }));
    const region = screen.getByRole('region', { name: 'Proposta de pessoas' });
    expect(region).toHaveTextContent('1 vaga confirmada, 0 propostas para revisar e 1 vaga vazia, em destaque na lista.');
    expect(await screen.findByRole('listitem', { name: 'Câmera: Vaga aberta' })).toHaveClass('is-missing');
  });
});
