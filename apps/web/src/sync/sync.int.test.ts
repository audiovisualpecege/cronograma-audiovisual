// Integração do SyncEngine com o Supabase local: supabase-js de verdade, dois aparelhos, cada um com a sua
// cópia local (fake-indexeddb no Node) e a sua sessão.
import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, inject, it, vi } from 'vitest';
import { assignmentOf, one, sql, useSeed as seedBeforeEachTest } from '../../../../tests/integration/helpers/supabase';
import { email, PASSWORD, person, role, sector, SLOT } from '../../../../tests/integration/helpers/ids';
// Tipos do `inject` (supabase, tokens) declarados no globalSetup da integração.
import type {} from '../../../../tests/integration/helpers/global-setup';
import { memoryStorage } from '../../test/fakeRemote';
import { createSupabaseRemote, type Profile, type Remote } from '../supabase';
import { LocalStore } from './localStore';
import { SyncEngine } from './syncEngine';

seedBeforeEachTest();

const running: SyncEngine[] = [];

afterEach(async () => {
  for (const e of running.splice(0)) {
    e.stop();
    await e.remote.close();
    e.store.close();
  }
});

// Assinatura do Realtime esquecida faz o Realtime seguir lendo as tabelas e disputar travas com a semente
// dos próximos arquivos.
afterAll(async () => {
  await sql('delete from realtime.subscription');
});

/** Um aparelho: login real, cópia local própria e o motor ligado. */
async function device(n: number, profile: Profile, options: { online?: boolean } = {}) {
  const env = inject('supabase');
  const remote: Remote = createSupabaseRemote({ url: env.apiUrl, key: env.publishableKey, storage: memoryStorage() });
  const login = await remote.signIn(email(n), PASSWORD);
  if (!login.ok) throw new Error(`Login de P${n} falhou: ${login.reason}`);
  const store = new LocalStore(`it-${n}-${randomUUID()}`);
  const engine = new SyncEngine({ store, remote, profile, online: options.online ?? true });
  running.push(engine);
  return { remote, store, engine };
}

describe('SyncEngine contra o Supabase local', () => {
  it('IT-085 fila ao reconectar: a pessoa é criada e o convite sai; a mesma alocação editada sem rede dá conflict', async () => {
    // Parte 1: P1 cadastra sem rede; ao reconectar a operação vai e o servidor pede o convite.
    const p1 = await device(1, 'admin', { online: false });
    await p1.engine.start();
    const id = randomUUID();
    await p1.engine.enqueue(
      'person.upsert',
      { id, name: 'Pessoa Nova 21', email: 'pessoa21@exemplo.test', sector_id: sector(3), role_ids: [role(1)] },
      { target: { table: 'people', id, changes: { name: 'Pessoa Nova 21', email: 'pessoa21@exemplo.test', active: true } } },
    );
    expect(p1.engine.getState().pending).toBe(1);
    expect(await sql('select 1 from public.people where id = $1', [id])).toHaveLength(0);

    p1.engine.setOnline(true);
    await vi.waitFor(() => expect(p1.engine.getState().pending).toBe(0), { timeout: 10_000 });
    const created = await one<{ name: string; invite_status: string }>('select name, invite_status from public.people where id = $1', [id]);
    expect(created).toEqual({ name: 'Pessoa Nova 21', invite_status: 'pending' });
    const invite = await one<{ status: string }>(
      "select status from public.jobs where kind = 'invite' and payload ->> 'person_id' = $1",
      [id],
    );
    expect(invite.status).toBe('queued');

    // Parte 2: P2 tem a alocação na cópia local e fica sem rede; P1 muda a mesma vaga com rede.
    const p2 = await device(2, 'admin');
    await p2.engine.start();
    const local = await p2.store.mirror('assignments').where('slot_id').equals(SLOT.E1_R1).first();
    expect(local?.person_id).toBe(person(5));
    p2.engine.setOnline(false);
    await p2.engine.enqueue('assignment.set', { slot_id: SLOT.E1_R1, person_id: person(4), override: true }, {
      baseVersion: local?.version as number,
      target: { table: 'assignments', id: local?.id as string, changes: { person_id: person(4) } },
    });

    await p1.engine.enqueue('assignment.set', { slot_id: SLOT.E1_R1, person_id: person(3), override: true }, {
      baseVersion: local?.version as number,
    });
    await vi.waitFor(async () => expect((await assignmentOf(SLOT.E1_R1)).person_id).toBe(person(3)), { timeout: 10_000 });

    p2.engine.setOnline(true);
    await vi.waitFor(() => expect(p2.engine.getState().conflicts).toHaveLength(1), { timeout: 10_000 });
    const conflict = p2.engine.getState().conflicts[0];
    const server = await assignmentOf(SLOT.E1_R1);
    expect(conflict?.server).toMatchObject({ person_id: person(3), version: server.version });
    expect(conflict?.local).toMatchObject({ person_id: person(4) });
    expect(server.person_id).toBe(person(3));
  });

  it('IT-086 P1 confirma uma alocação e o LocalStore de P2, em outro contexto, recebe a linha em até 5 s', async () => {
    const p1 = await device(1, 'admin');
    const p2 = await device(2, 'admin');
    await p2.engine.start();
    await vi.waitFor(() => expect(p2.engine.getState().realtimeLive).toBe(true), { timeout: 10_000 });
    const before = await p2.store.mirror('assignments').where('slot_id').equals(SLOT.E1_R1).first();
    expect(before?.person_id).toBe(person(5));

    const pulls = vi.spyOn(p2.remote, 'pullPage');
    const startedAt = Date.now();
    await p1.engine.enqueue('assignment.set', { slot_id: SLOT.E1_R1, person_id: person(3), override: true }, {
      baseVersion: before?.version as number,
    });
    await vi.waitFor(
      async () => {
        const row = await p2.store.mirror('assignments').get(before?.id as string);
        expect(row?.person_id).toBe(person(3));
      },
      { timeout: 5_000, interval: 100 },
    );
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    // Chegou pela leitura incremental disparada pelo aviso do Realtime, com o cursor da tabela.
    expect(pulls.mock.calls.some(([table, cursor]) => table === 'assignments' && cursor !== null)).toBe(true);
  });

  it('IT-089 P10 logado em dois clientes lê e marca aviso como lido nos dois sem perder a sessão de nenhum', async () => {
    const a = await device(10, 'team');
    const b = await device(10, 'team');
    await Promise.all([a.engine.start(), b.engine.start()]);
    await vi.waitFor(() => {
      expect(a.engine.getState().realtimeLive).toBe(true);
      expect(b.engine.getState().realtimeLive).toBe(true);
    }, { timeout: 10_000 });

    const first = await one<{ id: string }>("select id from public.notifications where dedupe_key = 'seed:p10'");
    expect((await a.store.mirror('notifications').get(first.id))?.read_at).toBeNull();
    expect((await b.store.mirror('notifications').get(first.id))?.read_at).toBeNull();

    // Lido no aparelho A: o servidor grava e o B recebe pelo Realtime.
    await a.engine.markNotificationsRead([first.id]);
    expect((await one<{ read_at: string | null }>('select read_at from public.notifications where id = $1', [first.id])).read_at).not.toBeNull();
    await vi.waitFor(async () => expect((await b.store.mirror('notifications').get(first.id))?.read_at).toBeTruthy(), { timeout: 5_000 });

    // Aviso novo, lido no B: o A recebe.
    const second = await one<{ id: string }>(
      `insert into public.notifications (person_id, kind, title, body, link, dedupe_key)
       values ($1, 'week_changed', 'Sua semana de 26/10 mudou', 'Entrou: Gravação aula Biologia', '#/minha-semana/2026-10-26', 'it-089')
       returning id`,
      [person(10)],
    );
    await vi.waitFor(async () => expect(await a.store.mirror('notifications').get(second.id)).toBeDefined(), { timeout: 5_000 });
    await vi.waitFor(async () => expect(await b.store.mirror('notifications').get(second.id)).toBeDefined(), { timeout: 5_000 });
    await b.engine.markNotificationsRead([second.id]);
    await vi.waitFor(async () => expect((await a.store.mirror('notifications').get(second.id))?.read_at).toBeTruthy(), { timeout: 5_000 });

    // As duas sessões continuam valendo.
    expect(a.remote.hasStoredSession()).toBe(true);
    expect(b.remote.hasStoredSession()).toBe(true);
    expect(await a.remote.loadMe()).toMatchObject({ status: 'ok', me: { personId: person(10), profile: 'team' } });
    expect(await b.remote.loadMe()).toMatchObject({ status: 'ok', me: { personId: person(10), profile: 'team' } });
  });
});
