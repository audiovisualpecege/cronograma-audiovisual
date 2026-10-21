import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithSync } from '../../test/helpers';
import { eventRow, NOW, slotWith, WEEK_B, weekRemote } from '../../test/weekFixtures';
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
