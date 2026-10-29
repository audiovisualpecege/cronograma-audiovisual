import { describe, expect, it } from 'vitest';
import { row } from '../../test/catalogRows';
import type { AbsenceRow, EventRow, HistoryFactRow, JobRoleRow, PersonRoleRow, PersonRow } from '../data/catalog';
import { agoText, relativeWeekLabel, seriesBases, weekTimeOff, type WeekRows } from './model';

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

describe('sede da série', () => {
  const fact = (personId: string, title: string, i: number) =>
    ({ event_id: `h${personId}${i}`, week_start: WEEK, event_date: WEEK, title, service_type_id: 't1', service_type_name: 'T1', job_role_id: 'r1', job_role_name: 'Operador', person_id: personId, person_name: personId, raw_name: null, hours: 2, source: 'import' }) as HistoryFactRow;
  const people = [person('sp', { base: 'sao_paulo' }), person('pi', { base: 'piracicaba' }), person('sem')];

  it('vem de quem costuma fazer: 3 em cada 4 da mesma sede, com ao menos 3 vezes; quem não tem sede não conta', () => {
    const facts = [
      ...[0, 1, 2].map((i) => fact('sp', 'MBA Agro - Aula 3', i)),
      fact('pi', 'MBA Agro - Aula 4', 0),
      ...[0, 1, 2].map((i) => fact('sem', 'MBA Agro', i)),
      // Meio a meio: sem sede.
      ...[0, 1].map((i) => fact('sp', 'Curso Solos', i)),
      ...[0, 1].map((i) => fact('pi', 'Curso Solos', i)),
      // Poucas vezes: sem sede.
      fact('pi', 'Webinar Café', 0),
    ];
    const bases = seriesBases(facts, people);
    expect([...bases]).toEqual([['mba agro', 'sao_paulo']]);
  });
});

describe('textos da semana', () => {
  it('agoText conta a última vez a partir da semana em escala', () => {
    expect(agoText('2026-10-19', WEEK)).toBe('na semana passada');
    expect(agoText('2026-09-28', WEEK)).toBe('há 4 semanas');
    expect(agoText('2026-03-02', WEEK)).toBe('há 8 meses');
  });

  it('relativeWeekLabel nomeia a semana em relação à atual', () => {
    expect(relativeWeekLabel('2026-10-19', '2026-10-19')).toBe('Semana atual');
    expect(relativeWeekLabel('2026-10-26', '2026-10-19')).toBe('Próxima semana');
    expect(relativeWeekLabel('2026-10-12', '2026-10-19')).toBe('Semana passada');
    expect(relativeWeekLabel('2026-11-09', '2026-10-19')).toBe('Daqui a 3 semanas');
    expect(relativeWeekLabel('2026-10-05', '2026-10-19')).toBe('Há 2 semanas');
  });

  it('weekTimeOff junta ausências cadastradas e folgas e férias da agenda, sem repetir', () => {
    const people = [person('p1', { name: 'Ana Souza' }), person('p2', { name: 'Bruno Lima' }), person('p3', { name: 'Bruno Alves' })];
    const folga = row('a1', { person_id: 'p1', kind: 'folga', starts_at: '2026-10-27T00:00:00-03:00', ends_at: '2026-10-28T00:00:00-03:00', all_day: true, note: null, archived_at: null }) as unknown as AbsenceRow;
    const ev = (id: string, title: string, start: string, end: string) =>
      row(id, { title, week_start: WEEK, starts_at: start, ends_at: end, status: 'active', ignored: false }) as unknown as EventRow;
    const events = [
      ev('e1', 'Folga Ana', '2026-10-27T00:00:00-03:00', '2026-10-28T00:00:00-03:00'),
      ev('e2', 'FÉRIAS Bruno Lima', '2026-10-20T00:00:00-03:00', '2026-10-30T00:00:00-03:00'),
      ev('e3', 'Férias Bruno', '2026-10-29T00:00:00-03:00', '2026-10-30T00:00:00-03:00'),
      ev('e4', 'Gravação aula', '2026-10-29T09:00:00-03:00', '2026-10-29T12:00:00-03:00'),
    ];
    expect(weekTimeOff(rows({ people, absences: [folga], events })).map((t) => [t.name, t.kind, t.from, t.to, t.personId])).toEqual([
      ['Bruno Lima', 'ferias', '2026-10-26', '2026-10-29', 'p2'],
      ['Ana Souza', 'folga', '2026-10-27', '2026-10-27', 'p1'],
      // Dois Brunos: sem o sobrenome, fica o título do evento.
      ['Férias Bruno', 'ferias', '2026-10-29', '2026-10-29', null],
    ]);
  });
});
