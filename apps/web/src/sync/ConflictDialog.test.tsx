import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeRemote } from '../../test/fakeRemote';
import { renderWithSync, setNetwork } from '../../test/helpers';
import { ConflictDialog, PendingCount, RejectionToasts } from './ConflictDialog';
import type { Row } from './types';

const P5 = 'd5';
const P6 = 'd6';

function Screen() {
  return (
    <>
      <PendingCount />
      <ConflictDialog />
      <RejectionToasts />
    </>
  );
}

async function prepare(remote: FakeRemote) {
  setNetwork(false);
  const view = renderWithSync(<Screen />, { remote });
  const { store, engine } = view;
  await store.mirror('people_public').bulkPut([
    { id: P5, name: 'Pessoa Exemplo 05', version: 1, updated_at: '' },
    { id: P6, name: 'Pessoa Exemplo 06', version: 1, updated_at: '' },
  ]);
  await store.mirror('assignments').put({ id: 'a1', slot_id: 's1', person_id: null, version: 3, updated_at: '' });
  await engine.enqueue('assignment.set', { slot_id: 's1', person_id: P5 }, {
    baseVersion: 3,
    target: { table: 'assignments', id: 'a1', changes: { person_id: P5 } },
  });
  return view;
}

describe('tela de conflito e contagem "a enviar"', () => {
  it('mostra "1 a enviar" sem rede e, ao reconectar com conflito, as duas versões com os nomes', async () => {
    const remote = new FakeRemote();
    const server: Row = { id: 'a1', slot_id: 's1', person_id: P6, version: 5, updated_at: '' };
    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'conflict', server, local: o.payload }));
    const { store } = await prepare(remote);
    expect(await screen.findByText(/a enviar/)).toHaveTextContent('1 a enviar');

    setNetwork(true);
    const dialog = await screen.findByRole('dialog', { name: 'Conflito de edição' });
    await waitFor(() => expect(within(dialog).getByLabelText('Minha versão')).toHaveTextContent('PessoaPessoa Exemplo 05'));
    expect(within(dialog).getByLabelText('Versão do servidor')).toHaveTextContent('PessoaPessoa Exemplo 06');
    expect(screen.queryByText(/a enviar/)).toBeNull();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Ficar com a do servidor' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await store.mirror('assignments').get('a1'))?.person_id).toBe(P6);
  });

  it('"Ficar com a minha versão" reenvia e fecha o conflito', async () => {
    const remote = new FakeRemote();
    const server: Row = { id: 'a1', slot_id: 's1', person_id: P6, version: 5, updated_at: '' };
    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'conflict', server, local: o.payload }));
    await prepare(remote);
    setNetwork(true);
    const dialog = await screen.findByRole('dialog', { name: 'Conflito de edição' });
    remote.applyHandler = (ops) => ops.map((o) => ({ opId: o.opId, status: 'applied', version: 6 }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ficar com a minha versão' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(remote.applyCalls.at(-1)?.[0]?.baseVersion).toBe(5));
  });

  it('mudança recusada aparece com o motivo até o administrador fechar', async () => {
    const remote = new FakeRemote();
    remote.applyHandler = (ops) =>
      ops.map((o) => ({ opId: o.opId, status: 'rejected', code: 'event_cancelled', message: 'Evento cancelado não aceita alocações.' }));
    await prepare(remote);
    setNetwork(true);
    const toast = await screen.findByText('Escala: Evento cancelado não aceita alocações.');
    expect(screen.getByText('Mudança recusada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    await waitFor(() => expect(toast).not.toBeInTheDocument());
  });
});
