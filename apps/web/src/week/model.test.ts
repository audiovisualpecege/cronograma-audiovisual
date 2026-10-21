import { describe, expect, it } from 'vitest';
import { row } from '../../test/catalogRows';
import type { AbsenceRow, JobRoleRow, PersonRoleRow, PersonRow } from '../data/catalog';
import { availabilityByRole, type WeekRows } from './model';

const WEEK = '2026-10-26';
const role = (id: string, code: string, name: string) => row(id, { code, name, sector_id: null, archived_at: null }) as unknown as JobRoleRow;
const person = (id: string, fields: Record<string, unknown> = {}) =>
  row(id, { code: id.toUpperCase(), name: id, email: `${id}@x.test`, sector_id: null, profile: 'team', weekly_limit_hours: 40, active: true, invite_status: 'accepted', ...fields }) as unknown as PersonRow;
const enabled = (personId: string, roleId: string) => row(`${personId}:${roleId}`, { person_id: personId, job_role_id: roleId, archived_at: null }) as unknown as PersonRoleRow;

function rows(extra: Partial<WeekRows> = {}): WeekRows {
  return {
    weekStart: WEEK,
    week: null,
    events: [],
    slots: [],
    assignments: [],
    published: [],
    people: [person('p1'), person('p2'), person('p3'), person('p4', { active: false })],
    personRoles: [enabled('p1', 'r1'), enabled('p1', 'r2'), enabled('p2', 'r1'), enabled('p2', 'r2'), enabled('p3', 'r2'), enabled('p4', 'r1')],
    absences: [],
    roles: [role('r1', 'R1', 'Operador'), role('r2', 'R2', 'Mediação')],
    types: [],
    crew: [],
    ...extra,
  };
}

describe('availabilityByRole', () => {
  it('conta cada pessoa ativa uma vez, na função que mais fez no histórico', () => {
    // p1 fez mais Mediação; p2 sem histórico fica na primeira pelo código (Operador); p4 inativa não conta.
    const facts = [
      { personId: 'p1', jobRoleId: 'r2' },
      { personId: 'p1', jobRoleId: 'r2' },
      { personId: 'p1', jobRoleId: 'r1' },
    ];
    expect(availabilityByRole(rows(), facts)).toEqual([
      { jobRoleId: 'r2', name: 'Mediação', people: 2 },
      { jobRoleId: 'r1', name: 'Operador', people: 1 },
    ]);
  });

  it('quem está ausente a semana inteira não está disponível', () => {
    const ferias = row('a1', { person_id: 'p3', kind: 'ferias', starts_at: '2026-10-26T00:00:00-03:00', ends_at: '2026-11-02T00:00:00-03:00', all_day: true, note: null, archived_at: null }) as unknown as AbsenceRow;
    expect(availabilityByRole(rows({ absences: [ferias] }), [])).toEqual([{ jobRoleId: 'r1', name: 'Operador', people: 2 }]);
  });
});
