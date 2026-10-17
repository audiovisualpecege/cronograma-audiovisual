// Semana publicada vista pela equipe, no formato do servidor: a semana A (19/10) na revisão 2, a fotografia
// em published_assignments, people_public sem e-mail e as próprias ausências da pessoa (P10).
import { SEED } from '@cronograma/core';
import type { Me } from '../src/supabase';
import type { Row, TableName } from '../src/sync/types';
import { row } from './catalogRows';
import { FakeRemote } from './fakeRemote';
import { eventRow } from './weekFixtures';

export const WEEK_A = '2026-10-19';
export const ME_P10: Me = { personId: 'p10', name: 'Pessoa Exemplo 10', profile: 'team' };

export const SECTOR_ROWS = SEED.sectors.map((s) => row(s.id, { name: s.name, archived_at: null }));
export const TEAM_ROLE_ROWS = SEED.jobRoles.map((r) => row(r.id, { code: r.code, name: r.name, sector_id: r.sectorId, archived_at: null }));

/** Pessoas como a equipe lê (people_public); P1 e P2 em Produção, o resto em Técnica, como a semente SQL. */
export function publicPeople(count = 20): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const pad = String(n).padStart(2, '0');
    return row(`p${n}`, { code: `P${n}`, name: `Pessoa Exemplo ${pad}`, sector_id: n <= 2 ? 's-producao' : 's-tecnica', profile: n <= 2 ? 'admin' : 'team', active: true });
  });
}

export function teamEvent(id: string, fields: Record<string, unknown> = {}) {
  return eventRow(id, { week_start: WEEK_A, starts_at: '2026-10-22T14:00:00-03:00', ends_at: '2026-10-22T17:00:00-03:00', ...fields });
}

let seq = 0;

/** Linha da fotografia publicada (pessoa nula = "a definir"). */
export function pub(eventId: string, roleId: string, personId: string | null, fields: Record<string, unknown> = {}) {
  seq += 1;
  return row(`pa-${seq}`, { week_id: 'w-a', revision: 2, event_id: eventId, slot_id: `s-${seq}`, job_role_id: roleId, person_id: personId, notes: null, ...fields });
}

export interface TeamSetup {
  week?: Record<string, unknown> | null;
  events?: Row[];
  published?: Row[];
  people?: Row[];
  absences?: Row[];
  notifications?: Row[];
  own?: Record<string, unknown>;
  extra?: Partial<Record<TableName, Row[]>>;
}

/** Remote falso do perfil Equipe com a semana A publicada. */
export function teamRemote(setup: TeamSetup = {}): FakeRemote {
  const remote = new FakeRemote();
  const people = setup.people ?? publicPeople();
  remote.rows = {
    weeks: setup.week === null ? [] : [row('w-a', { week_start: WEEK_A, state: 'published', revision: 2, ...setup.week })],
    events: setup.events ?? [],
    published_assignments: setup.published ?? [],
    people_public: people,
    people: [row('p10', { code: 'P10', name: 'Pessoa Exemplo 10', email: 'pessoa10@exemplo.test', sector_id: 's-tecnica', profile: 'team', active: true, push_enabled: true, ical_token: null, ...setup.own })],
    person_roles: [],
    sectors: SECTOR_ROWS,
    job_roles: TEAM_ROLE_ROWS,
    absences: setup.absences ?? [],
    notifications: setup.notifications ?? [],
    ...setup.extra,
  };
  return remote;
}

