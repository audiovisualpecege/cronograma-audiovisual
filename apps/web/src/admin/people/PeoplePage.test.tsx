import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { person, personRole, ROLES, row, SECTORS } from '../../../test/catalogRows';
import { FakeRemote } from '../../../test/fakeRemote';
import { renderWithSync, setNetwork } from '../../../test/helpers';
import { MAX_RENDERED } from '../../ui/VirtualList';
import { PeoplePage } from './PeoplePage';

function remoteWith(people: ReturnType<typeof person>[], extra: Partial<FakeRemote['rows']> = {}) {
  const remote = new FakeRemote();
  remote.rows = {
    people,
    sectors: SECTORS,
    job_roles: ROLES,
    person_roles: people.map((p, i) => personRole(p.id, ROLES[i % ROLES.length]?.id ?? 'r-1')),
    ...extra,
  };
  return remote;
}

describe('PeoplePage', () => {
  it('UT-108 email_taken mostra "Já existe uma pessoa com este e-mail" com link para o cadastro existente', async () => {
    const user = userEvent.setup();
    const remote = remoteWith([person(1), person(2, { name: 'Bruna Lima', email: 'bruna@exemplo.test' })]);
    renderWithSync(<PeoplePage />, { remote });
    await screen.findByText('Bruna Lima');

    await user.click(screen.getByRole('button', { name: /Nova pessoa/ }));
    const form = screen.getByRole('form', { name: 'Cadastro de pessoa' });
    await user.type(within(form).getByLabelText(/^Nome/), 'Outra Bruna');
    await user.type(within(form).getByLabelText(/^E-mail/), 'BRUNA@exemplo.test ');
    await user.click(within(form).getByLabelText('Câmera'));
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));

    expect(within(form).getByText('Já existe uma pessoa com este e-mail.')).toBeInTheDocument();
    const link = within(form).getByRole('link', { name: 'Abrir o cadastro de Bruna Lima' });
    expect(link).toHaveAttribute('href', '#/admin/pessoas?id=p-002');
    expect(remote.applyCalls).toHaveLength(0);

    await user.click(link);
    expect(await screen.findByRole('form', { name: 'Cadastro de Bruna Lima' })).toBeInTheDocument();
  });

  it('UT-149 cadastro com invite_status sent mostra "Reenviar convite", que chama request_job com kind invite', async () => {
    const user = userEvent.setup();
    const remote = remoteWith([person(1), person(7, { name: 'Caio Souza', invite_status: 'sent' })]);
    renderWithSync(<PeoplePage />, { remote });
    expect(await screen.findByText('convite enviado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir Caio Souza' }));
    const form = await screen.findByRole('form', { name: 'Cadastro de Caio Souza' });
    await user.click(within(form).getByRole('button', { name: 'Reenviar convite' }));

    await waitFor(() => expect(remote.rpcCalls).toEqual([{ fn: 'request_job', args: { kind: 'invite', payload: { person_id: 'p-007' } } }]));
    expect(await within(form).findByRole('status')).toHaveTextContent('Convite reenviado para pessoa007@exemplo.test');
  });

  it('pessoa com convite aceito não mostra "Reenviar convite"', async () => {
    const user = userEvent.setup();
    renderWithSync(<PeoplePage />, { remote: remoteWith([person(1)]) });
    await user.click(await screen.findByRole('button', { name: 'Abrir Pessoa 001' }));
    const form = await screen.findByRole('form', { name: 'Cadastro de Pessoa 001' });
    expect(within(form).queryByRole('button', { name: 'Reenviar convite' })).toBeNull();
  });

  it('UT-150 lista com 300 pessoas filtra por nome, setor e função e desenha no máximo 50 linhas', async () => {
    const user = userEvent.setup();
    const people = Array.from({ length: 300 }, (_, i) => person(i + 1, { sector_id: SECTORS[i % 3]?.id }));
    renderWithSync(<PeoplePage />, { remote: remoteWith(people) });
    expect(await screen.findByText('300 de 300 pessoas')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Pessoas' });
    const drawn = within(list).getAllByRole('listitem').length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThanOrEqual(MAX_RENDERED);

    await user.type(screen.getByLabelText(/^Buscar/), 'pessoa 150');
    expect(screen.getByText('1 de 300 pessoas')).toBeInTheDocument();
    expect(within(list).getByText('Pessoa 150')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Buscar/));

    // Setor e função seguem a mesma ordem: Técnica e Edição caem nas mesmas 100 pessoas; Técnica e Câmera, em nenhuma.
    await user.selectOptions(screen.getByLabelText(/^Setor/), 's-3');
    expect(screen.getByText('100 de 300 pessoas')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^Função/), 'r-3');
    expect(screen.getByText('100 de 300 pessoas')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^Função/), 'r-1');
    expect(screen.getByText('0 de 300 pessoas')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma pessoa com esses filtros.')).toBeInTheDocument();
  });

  it('cadastro novo sem limite grava 44 horas, exige função e entra na fila sem internet com convite pendente', async () => {
    const user = userEvent.setup();
    const remote = remoteWith([person(1)]);
    renderWithSync(<PeoplePage />, { remote });
    await screen.findByText('Pessoa 001');
    setNetwork(false);
    remote.offline = true;

    await user.click(screen.getByRole('button', { name: /Nova pessoa/ }));
    const form = screen.getByRole('form', { name: 'Cadastro de pessoa' });
    await user.type(within(form).getByLabelText(/^Nome/), 'Ana Teste');
    await user.type(within(form).getByLabelText(/^E-mail/), 'ana@exemplo.test');
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(within(form).getByText('Escolha ao menos uma função.')).toBeInTheDocument();

    await user.click(within(form).getByLabelText('Câmera'));
    await user.click(within(form).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());

    const item = (await screen.findByText('Ana Teste')).closest('button') as HTMLElement;
    expect(within(item).getByText('convite pendente')).toBeInTheDocument();
    expect(within(item).getByText('a enviar')).toBeInTheDocument();
    expect(within(item).getByText(/Câmera/)).toBeInTheDocument();
    expect(remote.applyCalls).toHaveLength(0);

    remote.offline = false;
    setNetwork(true);
    await waitFor(() => expect(remote.applyCalls.length).toBeGreaterThan(0));
    const op = remote.applyCalls.flat().find((o) => o.kind === 'person.upsert');
    expect(op?.payload).toMatchObject({ name: 'Ana Teste', email: 'ana@exemplo.test', weekly_limit_hours: 44, role_ids: ['r-1'], profile: 'team' });
  });

  it('desativar lista as alocações futuras e envia person.deactivate depois de confirmar', async () => {
    const user = userEvent.setup();
    const remote = remoteWith([person(1), person(5, { name: 'Davi Rocha' })], {
      events: [
        row('e-1', { title: 'Gravação aula Matemática', week_start: '2999-01-05', starts_at: '2999-01-07T17:00:00.000Z', ends_at: '2999-01-07T20:00:00.000Z', status: 'active' }),
        row('e-0', { title: 'Gravação antiga', week_start: '2020-01-06', starts_at: '2020-01-07T17:00:00.000Z', ends_at: '2020-01-07T20:00:00.000Z', status: 'active' }),
      ],
      slots: [row('v-1', { event_id: 'e-1', job_role_id: 'r-1', archived_at: null }), row('v-0', { event_id: 'e-0', job_role_id: 'r-1', archived_at: null })],
      assignments: [row('a-1', { slot_id: 'v-1', event_id: 'e-1', person_id: 'p-005' }), row('a-0', { slot_id: 'v-0', event_id: 'e-0', person_id: 'p-005' })],
    });
    renderWithSync(<PeoplePage />, { remote });
    await user.click(await screen.findByRole('button', { name: 'Abrir Davi Rocha' }));
    await user.click(within(await screen.findByRole('form', { name: 'Cadastro de Davi Rocha' })).getByRole('button', { name: 'Desativar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Desativar Davi Rocha' });
    const list = await within(dialog).findByRole('list', { name: 'Alocações futuras' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Gravação aula Matemática')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Desativar pessoa' }));

    await waitFor(() => expect(remote.applyCalls.flat().map((o) => o.kind)).toContain('person.deactivate'));
    const item = (await screen.findByText('Davi Rocha')).closest('button') as HTMLElement;
    expect(within(item).getByText('inativa')).toBeInTheDocument();
  });
});
