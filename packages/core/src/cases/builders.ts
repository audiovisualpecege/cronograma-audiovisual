// Construtores de cenário sobre a semente, para os testes e para quem compara o core com o SQL.
import { weekStartOf } from '../scheduling.ts';
import { zonedTime } from '../time.ts';
import type { AssignmentLike, AssignmentStatus, EventLike, PersonLike, SlotLike, WeekContext } from '../types.ts';
import { SEED } from './seed.ts';

/** Evento de agenda em 'YYYY-MM-DD' e 'HH:MM'; fim no dia seguinte quando `endDate` é dado. */
export function event(
  id: string,
  date: string,
  start: string,
  end: string,
  extra: Partial<EventLike> & { endDate?: string } = {},
): EventLike {
  const { endDate, ...rest } = extra;
  return {
    id,
    weekStart: weekStartOf(date),
    startsAt: zonedTime(date, start),
    endsAt: zonedTime(endDate ?? date, end),
    allDay: false,
    status: 'active',
    serviceTypeId: 't1',
    ...rest,
  };
}

export function slot(id: string, code: string, eventId: string, jobRoleId = 'r1', extra: Partial<SlotLike> = {}): SlotLike {
  return { id, code, eventId, jobRoleId, ...extra };
}

export function assign(
  s: SlotLike,
  personId: string,
  status: AssignmentStatus = 'confirmed',
  locked = false,
): AssignmentLike {
  return { slotId: s.id, eventId: s.eventId, personId, status, locked };
}

export function person(id: string, overrides: Partial<PersonLike> = {}): PersonLike {
  const base = SEED.people.find((p) => p.id === id);
  return { id, code: id.toUpperCase(), active: true, weeklyLimitHours: 44, roleIds: [], ...base, ...overrides };
}

export function weekContext(parts: Partial<WeekContext> = {}): WeekContext {
  return {
    weekStart: SEED.weekA,
    now: new Date(SEED.now),
    people: SEED.people,
    events: [],
    slots: [],
    assignments: [],
    absences: [],
    jobRoles: SEED.jobRoles,
    serviceTypes: SEED.serviceTypes,
    ...parts,
  };
}
