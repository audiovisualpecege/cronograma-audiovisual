// RLS por perfil: a chave pública vai no build, então é a RLS que esconde rascunho e dados de administrador.
import { describe, expect, it } from 'vitest';
import { EVENT, person, WEEK_A } from '../helpers/ids.ts';
import { anon, applyOps, as, buildWeekB, one, op, rpc, service, sql, useSeed } from '../helpers/supabase.ts';

const TABLES = [
  'sectors', 'job_roles', 'people', 'person_roles', 'service_types', 'service_type_crew', 'absences',
  'calendar_sources', 'weeks', 'events', 'slots', 'assignments', 'published_assignments', 'publications',
  'history_imports', 'history_entries', 'notifications', 'push_subscriptions', 'jobs', 'settings',
  'applied_ops', 'people_public', 'history_facts',
];

async function rows(client: ReturnType<typeof anon>, table: string) {
  const { data, error } = await client.from(table).select('*');
  return { data: data ?? [], error };
}

describe('RLS por perfil', () => {
  useSeed();

  it('IT-001 Equipe não lê vagas nem alocações e lê só a revisão corrente da fotografia', async () => {
    const p10 = as('P10');
    expect((await rows(p10, 'slots')).data).toHaveLength(0);
    expect((await rows(p10, 'assignments')).data).toHaveLength(0);
    const { data } = await p10.from('published_assignments').select('revision, person_id').eq('week_id', WEEK_A.id);
    expect(data).toHaveLength(6);
    expect(new Set(data?.map((r) => r.revision))).toEqual(new Set([2]));
    expect(data?.map((r) => r.person_id)).toContain(person(10));
    expect(data?.map((r) => r.person_id)).not.toContain(person(11));
    const { total } = await one<{ total: number }>('select count(*)::int as total from public.published_assignments');
    expect(total).toBe(12);
  });

  it('IT-002 Equipe recebe forbidden em toda operação de escrita', async () => {
    const res = await applyOps(as('P10'), [
      op('person.upsert', { name: 'Nova', email: 'nova@exemplo.test', role_ids: [] }),
      op('job_role.upsert', { name: 'Drone' }),
      op('absence.upsert', { person_id: person(10), kind: 'folga', starts_at: '2026-10-28T00:00:00-03:00', ends_at: '2026-10-29T00:00:00-03:00' }),
      op('event.update_extras', { id: EVENT.E1, notes: 'oi' }),
    ]);
    expect(res.map((r) => [r.status, r.code])).toEqual(Array(4).fill(['rejected', 'forbidden']));
    const { total } = await one<{ total: number }>("select count(*)::int as total from public.job_roles where name = 'Drone'");
    expect(total).toBe(0);
  });

  it('IT-003 Equipe lê as próprias ausências e avisos, não os de outra pessoa', async () => {
    const p10 = as('P10');
    const abs = await rows(p10, 'absences');
    expect(abs.data.length).toBe(1);
    expect(abs.data.every((a) => a.person_id === person(10))).toBe(true);
    const notes = await rows(p10, 'notifications');
    expect(notes.data.length).toBe(1);
    expect(notes.data.every((n) => n.person_id === person(10))).toBe(true);
    expect((await p10.from('absences').select('*').eq('person_id', person(11))).data).toEqual([]);
    expect((await p10.from('notifications').select('*').eq('person_id', person(11))).data).toEqual([]);
  });

  it('IT-004 Equipe lê eventos da semana publicada com observações, sem semana em montagem nem no_team', async () => {
    await buildWeekB();
    const { data } = await as('P10').from('events').select('id, notes, week_start');
    const ids = data?.map((e) => e.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining([EVENT.E1, EVENT.E2]));
    expect(ids).not.toContain(EVENT.E3);
    expect(ids).not.toContain(EVENT.E0);
    expect(data?.some((e) => e.week_start === '2026-10-26')).toBe(false);
    expect(data?.find((e) => e.id === EVENT.E1)?.notes).toBe('Levar o teleprompter');
    const weeks = await rows(as('P10'), 'weeks');
    expect(weeks.data.map((w) => w.week_start)).toEqual(['2026-10-19']);
  });

  it('IT-005 pessoa desativada perde a leitura de tudo com o mesmo JWT', async () => {
    const p10 = as('P10');
    expect((await rows(p10, 'people_public')).data.length).toBe(20);
    await service().from('people').update({ active: false }).eq('id', person(10)).throwOnError();
    for (const t of TABLES) {
      expect({ t, n: (await rows(p10, t)).data.length }).toEqual({ t, n: 0 });
    }
  });

  it('IT-006 Equipe lê people_public sem e-mail e só o próprio cadastro em people', async () => {
    const p10 = as('P10');
    const pub = await rows(p10, 'people_public');
    expect(pub.data).toHaveLength(20);
    expect(Object.keys(pub.data[0] ?? {})).not.toContain('email');
    expect((await p10.from('people_public').select('email')).error).not.toBeNull();
    const own = await rows(p10, 'people');
    expect(own.data.map((p) => p.id)).toEqual([person(10)]);
  });

  it('IT-007 sem sessão toda tabela devolve 0 linhas', async () => {
    const client = anon();
    for (const t of TABLES) {
      expect({ t, n: (await rows(client, t)).data.length }).toEqual({ t, n: 0 });
    }
  });

  it('IT-097 Equipe não lê o histórico importado', async () => {
    const [imp] = await sql<{ id: string }>(
      "insert into public.history_imports (file_name) values ('antiga.xlsx') returning id",
    );
    await sql(
      `insert into public.history_entries (import_id, week_start, event_date, event_key, title, job_role_id, person_id, raw_name)
       values ($1, '2026-09-28', '2026-09-30', 'k1', 'Gravação aula', $2, $3, 'Pessoa Exemplo 10')`,
      [imp?.id, 'b0000000-0000-4000-8000-000000000002', person(10)],
    );
    const p10 = as('P10');
    expect((await rows(p10, 'history_entries')).data).toHaveLength(0);
    expect((await rows(p10, 'history_imports')).data).toHaveLength(0);
    expect((await rows(p10, 'history_facts')).data).toHaveLength(0);
    expect((await rows(as('P1'), 'history_facts')).data).toHaveLength(1);
  });

  it('IT-098 Equipe não lê agendas, configuração nem fila', async () => {
    await rpc(as('P1'), 'request_job', { kind: 'calendar_sync', payload: {} });
    const p10 = as('P10');
    expect((await rows(p10, 'calendar_sources')).data).toHaveLength(0);
    expect((await rows(p10, 'settings')).data).toHaveLength(0);
    expect((await rows(p10, 'jobs')).data).toHaveLength(0);
    const p1 = as('P1');
    expect((await rows(p1, 'calendar_sources')).data).toHaveLength(2);
    expect((await rows(p1, 'settings')).data).toHaveLength(1);
    expect((await rows(p1, 'jobs')).data).toHaveLength(1);
  });
});
