// apply_ops em pessoas: cadastro e convite, e-mail repetido, clique duplo, último administrador,
// desativar e reativar, e nenhuma exclusão pelo REST.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EVENT, person, role, SLOT, WEEK_A } from '../helpers/ids.ts';
import {
  applyOne, applyOps, as, assignmentOf, buildWeekB, one, op, service, slotOf, sql, useSeed,
} from '../helpers/supabase.ts';

const newPerson = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name: 'Ana Teste',
  email: 'ana.teste@exemplo.test',
  role_ids: [role(1)],
  ...overrides,
});

describe('apply_ops: pessoas', () => {
  useSeed();

  it('IT-008 cadastro válido cria a pessoa com limite 44 e um convite na fila', async () => {
    const p = newPerson();
    const res = await applyOne(as('P1'), op('person.upsert', p));
    expect(res).toMatchObject({ status: 'applied', version: 1 });
    const row = await one('select * from public.people where id = $1', [p.id]);
    expect(row).toMatchObject({ name: 'Ana Teste', email: 'ana.teste@exemplo.test', profile: 'team', active: true, invite_status: 'pending' });
    expect(Number(row.weekly_limit_hours)).toBe(44);
    expect(row.code).toBe('P21');
    const roles = await sql('select job_role_id from public.person_roles where person_id = $1 and archived_at is null', [p.id]);
    expect(roles).toEqual([{ job_role_id: role(1) }]);
    const jobs = await sql<{ payload: { person_id: string } }>("select payload from public.jobs where kind = 'invite'");
    expect(jobs).toEqual([{ payload: { person_id: p.id } }]);
  });

  it('IT-009 e-mail de P5 devolve email_taken', async () => {
    const res = await applyOne(as('P1'), op('person.upsert', newPerson({ email: 'PESSOA05@exemplo.test' })));
    expect(res).toMatchObject({ status: 'rejected', code: 'email_taken', message: 'Já existe uma pessoa com este e-mail.' });
  });

  it('IT-010 dois administradores com o mesmo e-mail novo ao mesmo tempo: um aplica e o outro recebe email_taken', async () => {
    const [a, b] = await Promise.all([
      applyOne(as('P1'), op('person.upsert', newPerson({ email: 'mesmo@exemplo.test' }))),
      applyOne(as('P2'), op('person.upsert', newPerson({ email: 'mesmo@exemplo.test' }))),
    ]);
    expect([a?.status, b?.status].sort()).toEqual(['applied', 'rejected']);
    expect([a, b].find((r) => r?.status === 'rejected')?.code).toBe('email_taken');
    expect(await sql("select id from public.people where email = 'mesmo@exemplo.test'")).toHaveLength(1);
  });

  it('IT-011 o mesmo op_id duas vezes cria uma pessoa e devolve o mesmo resultado', async () => {
    const o = { ...op('person.upsert', newPerson({ id: undefined, email: 'duplo@exemplo.test' })), opId: randomUUID() };
    const first = await applyOne(as('P1'), o);
    const second = await applyOne(as('P1'), o);
    const [c1, c2] = await Promise.all([applyOne(as('P1'), o), applyOne(as('P2'), o)]);
    expect(first.status).toBe('applied');
    for (const r of [second, c1, c2]) expect(r).toEqual(first);
    expect(await sql("select id from public.people where email = 'duplo@exemplo.test'")).toHaveLength(1);
    expect(await sql("select * from public.jobs where kind = 'invite'")).toHaveLength(1);
  });

  it('IT-012 com P1 único administrador ativo, rebaixar ou desativar P1 devolve last_admin', async () => {
    await service().from('people').update({ active: false }).eq('id', person(2)).throwOnError();
    const res = await applyOps(as('P1'), [
      op('person.upsert', { id: person(1), name: 'Pessoa Exemplo 01', email: 'pessoa01@exemplo.test', role_ids: [role(6)], profile: 'team' }),
      op('person.deactivate', { id: person(1) }),
    ]);
    expect(res.map((r) => [r.status, r.code])).toEqual([['rejected', 'last_admin'], ['rejected', 'last_admin']]);
    expect(res[0]?.message).toBe('Precisa haver pelo menos um administrador ativo.');
    expect(await one('select profile, active from public.people where id = $1', [person(1)])).toEqual({ profile: 'admin', active: true });
  });

  it('IT-014 desativar P5 libera as vagas das semanas A e B, marca a semana publicada e pede banimento e revogação', async () => {
    const { slots } = await buildWeekB();
    const b1r1 = slots[EVENT.B1]?.R1?.[0] as string;
    expect((await applyOne(as('P1'), op('assignment.set', { slot_id: b1r1, person_id: person(5) }))).status).toBe('applied');
    await sql('update public.weeks set dirty_since = null');

    const res = await applyOne(as('P1'), op('person.deactivate', { id: person(5) }));
    expect(res.status).toBe('applied');
    expect(await sql('select * from public.assignments where person_id = $1', [person(5)])).toHaveLength(0);
    expect((await assignmentOf(SLOT.E1_R1)).person_id).toBeNull();
    expect((await assignmentOf(b1r1)).person_id).toBeNull();
    const weekA = await one<{ dirty_since: Date | null }>('select dirty_since from public.weeks where id = $1', [WEEK_A.id]);
    expect(weekA.dirty_since).not.toBeNull();
    const jobs = await sql<{ kind: string; payload: { person_id: string } }>('select kind, payload from public.jobs order by kind');
    expect(jobs.map((j) => j.kind)).toEqual(['auth_ban', 'ical_revoke']);
    expect(jobs.every((j) => j.payload.person_id === person(5))).toBe(true);
    expect(await one('select active, ical_token from public.people where id = $1', [person(5)])).toEqual({ active: false, ical_token: null });
  });

  it('IT-015 reativar P5 pede o desbanimento e P5 volta a ser apto', async () => {
    await buildWeekB();
    const b1r1 = await slotOf(EVENT.B1, 'R1');
    await applyOne(as('P1'), op('person.deactivate', { id: person(5) }));
    const blocked = await one<{ r: { blockers: string[] } }>('select public.check_eligibility($1, $2) as r', [person(5), b1r1]);
    expect(blocked.r.blockers).toEqual(['person_inactive']);

    expect((await applyOne(as('P1'), op('person.reactivate', { id: person(5) }))).status).toBe('applied');
    expect(await sql("select payload from public.jobs where kind = 'auth_unban'")).toEqual([{ payload: { person_id: person(5) } }]);
    const ok = await one<{ r: { ok: boolean } }>('select public.check_eligibility($1, $2) as r', [person(5), b1r1]);
    expect(ok.r.ok).toBe(true);
    expect((await applyOne(as('P1'), op('assignment.set', { slot_id: b1r1, person_id: person(5) }))).status).toBe('applied');
  });

  it('IT-091 DELETE em people pelo REST com o JWT de P1 não apaga nada', async () => {
    const { error, data } = await as('P1').from('people').delete().eq('id', person(5)).select();
    expect(data ?? []).toHaveLength(0);
    expect(error?.code).toBe('42501');
    expect(await sql('select id from public.people')).toHaveLength(20);
    const { error: e2 } = await as('P1').from('assignments').delete().eq('slot_id', SLOT.E1_R1);
    expect(e2).not.toBeNull();
    expect(await sql('select id from public.assignments where slot_id = $1', [SLOT.E1_R1])).toHaveLength(1);
  });
});
