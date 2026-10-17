import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { person, personRole, ROLES, row, SECTORS, TYPES } from '../../test/catalogRows';
import { FakeRemote } from '../../test/fakeRemote';
import { renderWithSync } from '../../test/helpers';
import { ImportPage, INVALID_FILE } from './ImportPage';
import type { ReadWorker } from './reader';
import { runRead, type ReadMessage, type ReadRequest } from './readJob';

// Planilhas de exemplo em fixtures/ na raiz do monorepo (o teste roda com a pasta do app ou a raiz como cwd).
function fixture(name: string): Uint8Array {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'fixtures', name)) && dirname(dir) !== dir) dir = dirname(dir);
  return readFileSync(join(dir, 'fixtures', name));
}

/** Worker falso que roda a leitura de verdade no mesmo processo. */
function inThreadWorker(): ReadWorker {
  const w: ReadWorker = {
    onmessage: null,
    onerror: null,
    postMessage(msg: ReadRequest) {
      setTimeout(() => runRead(msg, (m) => w.onmessage?.({ data: m } as MessageEvent<ReadMessage>)), 0);
    },
    terminate() {},
  };
  return w;
}

/** Worker falso controlado pelo teste: guarda o pedido e só responde quando o teste manda. */
function manualWorker() {
  const state = { terminated: false, requests: [] as ReadRequest[], worker: null as unknown as ReadWorker };
  state.worker = {
    onmessage: null,
    onerror: null,
    postMessage(msg: ReadRequest) {
      state.requests.push(msg);
    },
    terminate() {
      state.terminated = true;
    },
  };
  return { ...state, get: () => state, send: (m: ReadMessage) => state.worker.onmessage?.({ data: m } as MessageEvent<ReadMessage>) };
}

function protectedXlsx(): Uint8Array {
  const cfb = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(cfb, '/EncryptionInfo', new Uint8Array([4, 0, 4, 0, 0x40, 0, 0, 0]));
  XLSX.CFB.utils.cfb_add(cfb, '/EncryptedPackage', new Uint8Array(64));
  return new Uint8Array(XLSX.CFB.write(cfb, { type: 'array' }) as number[]);
}

function catalogRemote() {
  const remote = new FakeRemote();
  const people = [
    person(1, { name: 'Bruno Exemplo' }),
    person(2, { name: 'João Pedro Silva' }),
    person(3, { name: 'Carla Modelo' }),
  ];
  remote.rows = {
    people,
    person_roles: people.map((p) => personRole(p.id, 'r-1')),
    sectors: SECTORS,
    job_roles: [...ROLES, row('r-4', { code: 'R4', name: 'Mediação', sector_id: null, archived_at: null })],
    service_types: TYPES,
    weeks: [row('w-1', { week_start: '2026-10-19', state: 'published' })],
  };
  remote.views.history_facts = [];
  return remote;
}

function renderImport(remote: FakeRemote, createWorker: () => ReadWorker = inThreadWorker) {
  const view = renderWithSync(<ImportPage createWorker={createWorker} />, { remote });
  return view;
}

async function upload(user: ReturnType<typeof userEvent.setup>, name: string, bytes: Uint8Array, view?: ReturnType<typeof renderImport>) {
  // A cópia local termina a primeira leitura antes do arquivo chegar, como no aparelho.
  if (view) await waitFor(() => expect(view.engine.getState().lastSyncAt).not.toBeNull());
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  await user.upload(screen.getByTestId('arquivo'), file);
}

describe('ImportPage', () => {
  it.each([
    ['cronograma.csv', () => new TextEncoder().encode('data;evento;pessoa\n05/10;Gravação;Ana\n')],
    ['corrompido.xlsx', () => new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9])],
    ['com-senha.xlsx', protectedXlsx],
  ])('UT-119 %s mostra "Arquivo não reconhecido como planilha .xlsx válida"', async (name, bytes) => {
    const user = userEvent.setup({ applyAccept: false });
    const remote = catalogRemote();
    renderWithSync(<ImportPage createWorker={inThreadWorker} />, { remote });
    await upload(user, name, bytes());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`${INVALID_FILE}.`);
    expect(alert.textContent?.length ?? 0).toBeGreaterThan(INVALID_FILE.length + 10); // diz o que fazer
    expect(remote.rpcCalls).toHaveLength(0);
  });

  it('UT-120 leitura de arquivo grande mostra progresso por aba; "Cancelar" encerra o Web Worker e nada é enviado', async () => {
    const user = userEvent.setup();
    const remote = catalogRemote();
    const fake = manualWorker();
    renderWithSync(<ImportPage createWorker={() => fake.get().worker} />, { remote });
    await upload(user, 'anos.xlsx', fixture('oficial-2026.xlsx'));

    await waitFor(() => expect(fake.get().requests).toHaveLength(1));
    fake.send({ type: 'progress', sheet: '05 - 11 de OUTUBRO-26', index: 0, total: 24 });
    expect(await screen.findByText('Lendo aba 1 de 24: 05 - 11 de OUTUBRO-26')).toBeInTheDocument();
    fake.send({ type: 'progress', sheet: '12 - 18 de OUTUBRO-26', index: 1, total: 24 });
    expect(await screen.findByText('Lendo aba 2 de 24: 12 - 18 de OUTUBRO-26')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso da leitura' })).toHaveAttribute('value', '2');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(fake.get().terminated).toBe(true);
    expect(await screen.findByText('Leitura cancelada. Nada foi gravado.')).toBeInTheDocument();
    // Uma resposta atrasada do worker encerrado não reabre a revisão.
    fake.send({ type: 'done', result: { weeks: [], skipped: [], sheets: [], message: null } });
    expect(screen.queryByText(/Revisão de/)).toBeNull();
    expect(remote.rpcCalls).toHaveLength(0);
  });

  it('planilha oficial: revisão obrigatória, nada enviado antes de confirmar e gravação por commit_history_import', async () => {
    const user = userEvent.setup();
    const remote = catalogRemote();
    remote.rpcHandler = (fn) => (fn === 'commit_history_import' ? { weeks: 1, events: 9, assignments: 19, skipped: 1 } : {});
    const view = renderImport(remote);
    await upload(user, 'oficial-2026.xlsx', fixture('oficial-2026.xlsx'), view);

    expect(await screen.findByText('Revisão de oficial-2026.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/Semana de 05\/10\/2026 a 11\/10\/2026/)).toBeInTheDocument();
    expect(remote.rpcCalls).toHaveLength(0);

    // "João Pedro Exemplo" sugere João Pedro Silva; "Bruno Exemplo" é o mesmo nome do cadastro.
    const joao = screen.getByRole('group', { name: 'Ligação de João Pedro Exemplo' });
    expect(within(joao).getByRole('radio', { name: 'João Pedro Silva (sugerido)' })).toBeChecked();
    expect(within(screen.getByRole('group', { name: 'Ligação de Bruno Exemplo' })).getByRole('radio', { name: 'Bruno Exemplo (mesmo nome)' })).toBeChecked();
    await user.click(within(screen.getByRole('group', { name: 'Ligação de Hugo Rascunho' })).getByRole('radio', { name: 'Ignorar' }));

    // Funções lidas: Mediador sugere Mediação; Operador fica sem função até escolher.
    expect(screen.getByLabelText('Mediador (4)')).toHaveValue('r-4');
    await user.selectOptions(screen.getByLabelText('Operador (12)'), 'r-1');
    // Tipo por evento.
    await user.click(screen.getByText('Ver eventos e tipos'));
    await user.selectOptions(screen.getByLabelText('Tipo de GRAVAÇÃO: MBA em Gestão de Projetos'), 't-1');

    const skipped = screen.getByRole('list', { name: 'Não importados' });
    expect(within(skipped).getByText('data inválida')).toBeInTheDocument();
    expect(within(skipped).getByText('células mescladas fora do padrão')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    expect(await screen.findByText('Importação concluída')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 semanas, 9 eventos e 19 alocações entraram no histórico.');

    const call = remote.rpcCalls.find((c) => c.fn === 'commit_history_import');
    expect(call?.args).toMatchObject({
      file_name: 'oficial-2026.xlsx',
      replace_weeks: [],
      role_links: { Operador: 'r-1', Mediador: 'r-4', Assistente: null },
    });
    const links = call?.args.name_links as Record<string, unknown>;
    expect(links['João Pedro Exemplo']).toEqual({ person_id: 'p-002' });
    expect(links['Bruno Exemplo']).toEqual({ person_id: 'p-001' });
    expect(links['Hugo Rascunho']).toEqual({ ignore: true });
    expect(links['Gabi Ensaio']).toEqual({ create: true });
    const weeks = call?.args.weeks as { weekStart: string; events: { title: string; typeLabel: string | null }[] }[];
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-05']);
    expect(weeks[0]?.events.find((e) => e.title.startsWith('GRAVAÇÃO: MBA em Gestão'))?.typeLabel).toBe('T1');
  });

  it('semana já importada pede substituir ou ignorar antes de confirmar', async () => {
    const user = userEvent.setup();
    const remote = catalogRemote();
    remote.views.history_facts = [
      { event_id: 'import:x', week_start: '2026-10-05', event_date: '2026-10-05', title: 'Antigo', service_type_id: null, job_role_id: null, person_id: null, hours: 1, source: 'import' },
    ];
    remote.rpcHandler = () => ({ weeks: 1, events: 9, assignments: 0, skipped: 0 });
    const view = renderImport(remote);
    await upload(user, 'oficial-2026.xlsx', fixture('oficial-2026.xlsx'), view);

    expect(await screen.findByText('já importada')).toBeInTheDocument();
    expect(screen.getByText('Escolha se substitui ou ignora as semanas já importadas antes de confirmar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Substituir a semana antiga' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar importação' }));
    await waitFor(() => expect(remote.rpcCalls.find((c) => c.fn === 'commit_history_import')?.args.replace_weeks).toEqual(['2026-10-05']));
  });

  it('cancelar a revisão não envia nada', async () => {
    const user = userEvent.setup();
    const remote = catalogRemote();
    const view = renderImport(remote);
    await upload(user, 'oficial-2026.xlsx', fixture('oficial-2026.xlsx'), view);
    await screen.findByText('Revisão de oficial-2026.xlsx');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Importação cancelada. Nada foi gravado.')).toBeInTheDocument();
    expect(remote.rpcCalls).toHaveLength(0);
  });
});
