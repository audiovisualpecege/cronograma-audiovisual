// build_week: cria a semana em montagem e as vagas da equipe típica de cada evento com tipo.
import { describe, expect, it } from 'vitest';
import { as, buildWeekB, one, rpc, rpcError, sql, useSeed } from '../helpers/supabase.ts';
import { EVENT } from '../helpers/ids.ts';

describe('build_week', () => {
  useSeed();

  it('IT-038 cria a semana B em montagem com as vagas dos três T1 e nada para T4 e sem tipo', async () => {
    const res = await rpc<{ week_id: string; slots_created: number }>(as('P1'), 'build_week', { week_start: '2026-10-26' });
    expect(res.slots_created).toBe(6);
    const [week] = await sql<{ id: string; state: string; revision: number }>(
      "select id, state, revision from public.weeks where week_start = '2026-10-26'",
    );
    expect(week).toMatchObject({ id: res.week_id, state: 'building', revision: 0 });
    const counts = await sql<{ event_id: string; n: number }>(
      `select e.id as event_id, count(s.id)::int as n from public.events e
       left join public.slots s on s.event_id = e.id and s.archived_at is null
       where e.week_start = '2026-10-26' group by e.id`,
    );
    const byEvent = Object.fromEntries(counts.map((c) => [c.event_id, c.n]));
    expect(byEvent).toEqual({ [EVENT.B1]: 2, [EVENT.B2]: 2, [EVENT.B3]: 2, [EVENT.B4]: 0, [EVENT.B5]: 0 });
    const open = await sql(
      "select a.* from public.assignments a join public.events e on e.id = a.event_id where e.week_start = '2026-10-26'",
    );
    expect(open).toHaveLength(6);
    expect(open.every((a) => a.person_id === null)).toBe(true);
  });

  it('IT-039 chamar de novo devolve a mesma semana sem vagas novas', async () => {
    const first = await buildWeekB();
    const again = await rpc<{ week_id: string; slots_created: number }>(as('P2'), 'build_week', { week_start: '2026-10-28' });
    expect(again).toMatchObject({ week_id: first.weekId, slots_created: 0 });
    const { n } = await one<{ n: number }>(
      "select count(*)::int as n from public.slots s join public.events e on e.id = s.event_id where e.week_start = '2026-10-26'",
    );
    expect(n).toBe(6);
  });

  it('IT-040 semana passada devolve week_past', async () => {
    const err = await rpcError(as('P1'), 'build_week', { week_start: '2026-10-12' });
    expect(err).toMatchObject({ code: 'week_past', sqlstate: 'P0001' });
    expect(err.detail).toBeTruthy();
  });

  it('IT-041 semana sem eventos devolve no_events', async () => {
    const err = await rpcError(as('P1'), 'build_week', { week_start: '2026-11-09' });
    expect(err).toMatchObject({ code: 'no_events', detail: 'Nenhum evento nesta semana.' });
    expect(await sql("select * from public.weeks where week_start = '2026-11-09'")).toHaveLength(0);
  });

  it('Equipe não monta semana', async () => {
    expect(await rpcError(as('P10'), 'build_week', { week_start: '2026-10-26' })).toMatchObject({ code: 'forbidden' });
  });
});
