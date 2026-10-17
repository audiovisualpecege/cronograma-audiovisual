// Semana de teste das telas do administrador, no formato do servidor, derivada da semente do _tests.md:
// funções R1 a R6, tipos T1 (1 R1, 1 R5), T2 (2 R1, 1 R2, 1 R6) e T4 (não exige equipe), semana B em 26/10.
import { SEED } from '@cronograma/core';
import type { Row, TableName } from '../src/sync/types';
import { row, SETTINGS } from './catalogRows';
import { FakeRemote } from './fakeRemote';

export const WEEK_B = '2026-10-26';
export const NOW = new Date('2026-10-21T12:00:00-03:00');

export const ROLE_ROWS = SEED.jobRoles.map((r) => row(r.id, { code: r.code, name: r.name, sector_id: null, archived_at: null }));
export const TYPE_ROWS = SEED.serviceTypes.map((t) => row(t.id, { code: t.code, name: t.name, keywords: t.keywords, no_team: t.noTeam, archived_at: null }));
export const CREW_ROWS = SEED.serviceTypes.flatMap((t) =>
  t.crew.map((c) => row(`${t.id}:${c.jobRoleId}`, { service_type_id: t.id, job_role_id: c.jobRoleId, quantity: c.quantity, archived_at: null })),
);

export function peopleRows(count = 20, overrides: Record<string, Record<string, unknown>> = {}) {
  return SEED.people.slice(0, count).map((p) =>
    row(p.id, {
      code: p.code,
      name: p.name,
      email: p.email,
      sector_id: null,
      profile: p.profile,
      weekly_limit_hours: p.weeklyLimitHours,
      active: true,
      invite_status: 'accepted',
      ...overrides[p.id],
    }),
  );
}

export function personRoleRows(count = 20) {
  return SEED.people.slice(0, count).flatMap((p) => p.roleIds.map((r) => row(`${p.id}:${r}`, { person_id: p.id, job_role_id: r, archived_at: null })));
}

let seq = 0;

export function eventRow(id: string, fields: Record<string, unknown> = {}) {
  return row(id, {
    origin: 'calendar',
    calendar_source_id: 'S1',
    google_event_id: `g-${id}`,
    week_start: WEEK_B,
    title: `Evento ${id}`,
    location: 'Estúdio 1',
    description: null,
    starts_at: '2026-10-26T09:00:00-03:00',
    ends_at: '2026-10-26T12:00:00-03:00',
    all_day: false,
    period_start: null,
    period_end: null,
    status: 'active',
    change_original: null,
    review_pending: false,
    restored: false,
    duplicate_group: null,
    ignored: false,
    service_type_id: 't1',
    type_certainty: 'alta',
    type_source: 'keyword',
    no_team: false,
    notes: null,
    crew_outdated: false,
    ...fields,
  });
}

/** Vaga com a linha de alocação; pessoa nula = vaga aberta. */
export function slotWith(eventId: string, roleId: string, person: string | null = null, status: 'proposed' | 'confirmed' | null = person ? 'confirmed' : null, extra: Record<string, unknown> = {}) {
  seq += 1;
  const slotId = `v-${eventId}-${seq}`;
  return {
    slot: row(slotId, { event_id: eventId, job_role_id: roleId, extra: false, archived_at: null }),
    assignment: row(`a-${slotId}`, {
      slot_id: slotId,
      event_id: eventId,
      person_id: person,
      status,
      locked: false,
      warnings: [],
      override: false,
      reason: null,
      decided_by: null,
      decided_at: null,
      ...extra,
    }),
  };
}

export const SOURCES = [
  row('S1', { google_calendar_id: 'pecegeworks@gmail.com', label: 'pecegeworks', enabled: true, status: 'connected', last_synced_at: '2026-10-21T14:45:00.000Z', last_error: null }),
  row('S2', { google_calendar_id: 'audiovisualpecege@gmail.com', label: 'audiovisualpecege', enabled: true, status: 'connected', last_synced_at: '2026-10-21T14:45:00.000Z', last_error: null }),
];

export interface WeekSetup {
  week?: Record<string, unknown> | null;
  events?: Row[];
  slots?: { slot: Row; assignment: Row }[];
  people?: Row[];
  personRoles?: Row[];
  settings?: Record<string, unknown>;
  published?: Row[];
  extra?: Partial<Record<TableName, Row[]>>;
}

/** Remote falso com a semana B pronta para as telas. */
export function weekRemote(setup: WeekSetup = {}): FakeRemote {
  const remote = new FakeRemote();
  const week = setup.week === null ? [] : [row('w-b', { week_start: WEEK_B, state: 'building', revision: 0, dirty_since: null, published_at: null, published_by: null, ...setup.week })];
  remote.rows = {
    weeks: week,
    events: setup.events ?? [],
    slots: (setup.slots ?? []).map((s) => s.slot),
    assignments: (setup.slots ?? []).map((s) => s.assignment),
    published_assignments: setup.published ?? [],
    people: setup.people ?? peopleRows(),
    person_roles: setup.personRoles ?? personRoleRows(),
    absences: [],
    job_roles: ROLE_ROWS,
    service_types: TYPE_ROWS,
    service_type_crew: CREW_ROWS,
    calendar_sources: SOURCES,
    settings: [{ ...SETTINGS, ...setup.settings }],
    jobs: [],
    ...setup.extra,
  };
  return remote;
}
