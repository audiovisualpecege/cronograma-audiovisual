// IT-090: a função SQL check_eligibility dá a mesma resposta que checkEligibility do core nos casos UT-010
// a UT-021, montados no banco a partir da mesma tabela de casos (packages/core/src/cases/eligibility.ts).
import { randomUUID } from 'node:crypto';
import { checkEligibility, ELIGIBILITY_CASES, eligibilityContext } from '@cronograma/core';
import { describe, expect, it } from 'vitest';
import { person, role, type } from '../helpers/ids.ts';
import { db, useSeed } from '../helpers/supabase.ts';

const seedId = (id: string): string => {
  const m = /^([prt])(\d+)$/.exec(id);
  if (!m) throw new Error(`id sem correspondência na semente: ${id}`);
  const n = Number(m[2]);
  return m[1] === 'p' ? person(n) : m[1] === 'r' ? role(n) : type(n);
};

describe('check_eligibility em SQL', () => {
  useSeed();

  it.each(ELIGIBILITY_CASES.map((c) => [c.id, c] as const))('IT-090 %s igual ao core', async (_id, c) => {
    const { ctx, personId, slotId } = eligibilityContext(c);
    const core = checkEligibility(personId, slotId, ctx);
    expect(core).toMatchObject({ blockers: c.expected.blockers, warnings: c.expected.warnings });

    const sqlResult = await db(async (client) => {
      await client.query('begin');
      try {
        const ids = new Map<string, string>();
        const uuid = (id: string) => {
          if (!ids.has(id)) ids.set(id, randomUUID());
          return ids.get(id) as string;
        };
        const who = seedId(personId);
        // A pessoa do caso começa sem escala nem ausência; o cenário do core é a única coisa no banco.
        await client.query('update public.assignments set person_id = null, status = null where person_id = $1', [who]);
        await client.query('update public.absences set archived_at = now() where person_id = $1', [who]);
        const p = ctx.people.find((x) => x.id === personId);
        await client.query('update public.people set active = $2, weekly_limit_hours = $3 where id = $1', [who, p?.active, p?.weeklyLimitHours]);
        for (const e of ctx.events) {
          await client.query(
            `insert into public.events (id, origin, title, starts_at, ends_at, all_day, status, service_type_id)
             values ($1, 'internal', $2, $3, $4, $5, $6, $7)`,
            [uuid(e.id), e.id, e.startsAt, e.endsAt, e.allDay, e.status, e.serviceTypeId ? seedId(e.serviceTypeId) : null],
          );
        }
        for (const s of ctx.slots) {
          await client.query('insert into public.slots (id, event_id, job_role_id) values ($1, $2, $3)', [uuid(s.id), uuid(s.eventId), seedId(s.jobRoleId)]);
          const a = ctx.assignments.find((x) => x.slotId === s.id);
          await client.query(
            'insert into public.assignments (slot_id, event_id, person_id, status) values ($1, $2, $3, $4)',
            [uuid(s.id), uuid(s.eventId), a ? seedId(a.personId) : null, a ? a.status : null],
          );
        }
        for (const ab of ctx.absences) {
          await client.query(
            "insert into public.absences (person_id, kind, starts_at, ends_at) values ($1, 'ausencia', $2, $3)",
            [seedId(ab.personId), ab.startsAt, ab.endsAt],
          );
        }
        const { rows } = await client.query('select public.check_eligibility($1, $2) as r', [who, uuid(slotId)]);
        return rows[0].r as { ok: boolean; blockers: string[]; warnings: string[] };
      } finally {
        await client.query('rollback');
      }
    });
    expect(sqlResult).toEqual(core);
  });
});
