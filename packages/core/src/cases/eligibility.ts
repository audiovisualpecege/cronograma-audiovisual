// Casos de aptidão UT-010 a UT-021 como dado: os testes do core e os de integração da função SQL
// check_eligibility (tarefa 3) montam o mesmo cenário a partir daqui e esperam a mesma resposta.
import { weekStartOf } from '../scheduling.ts';
import { zonedTime } from '../time.ts';
import type { AssignmentLike, Blocker, EventLike, EventStatus, SlotLike, Warning, WeekContext } from '../types.ts';
import { SEED } from './seed.ts';

export interface EligibilityCase {
  id: string;
  title: string;
  person: { id: string; active?: boolean; weeklyLimitHours?: number };
  /** Vaga avaliada; padrão 21/10 14:00 a 17:00, função R1, evento ativo. */
  slot?: { date?: string; start?: string; end?: string; jobRoleId?: string; eventStatus?: EventStatus };
  /** Horas já alocadas à pessoa na semana A, em dias sem conflito com a vaga. */
  loadHours?: number;
  /** Outras alocações da pessoa, em 'YYYY-MM-DD' e 'HH:MM'. `sameEvent` põe na outra vaga do mesmo evento. */
  others?: { date: string; start: string; end: string; sameEvent?: boolean }[];
  absences?: { from: [string, string]; to: [string, string] }[];
  expected: { blockers: Blocker[]; warnings: Warning[] };
}

const DEFAULT_SLOT = { date: '2026-10-21', start: '14:00', end: '17:00', jobRoleId: 'r1', eventStatus: 'active' as EventStatus };

export const ELIGIBILITY_CASES: EligibilityCase[] = [
  { id: 'UT-010', title: 'apta, sem conflito, carga 10 h de 44', person: { id: 'p5' }, loadHours: 10, expected: { blockers: [], warnings: [] } },
  {
    id: 'UT-011',
    title: 'alocação 10:00 a 12:00 e vaga 11:00 a 13:00',
    person: { id: 'p5' },
    slot: { start: '11:00', end: '13:00' },
    others: [{ date: '2026-10-21', start: '10:00', end: '12:00' }],
    expected: { blockers: [], warnings: ['overlap'] },
  },
  {
    id: 'UT-012',
    title: 'alocação 10:00 a 12:00 e vaga 12:00 a 14:00',
    person: { id: 'p5' },
    slot: { start: '12:00', end: '14:00' },
    others: [{ date: '2026-10-21', start: '10:00', end: '12:00' }],
    expected: { blockers: [], warnings: [] },
  },
  {
    id: 'UT-013',
    title: 'ausência de 21/10 00:00 a 22/10 00:00 e vaga 21/10 14:00',
    person: { id: 'p5' },
    absences: [{ from: ['2026-10-21', '00:00'], to: ['2026-10-22', '00:00'] }],
    expected: { blockers: [], warnings: ['absent'] },
  },
  {
    id: 'UT-014',
    title: 'ausência termina 14:00 e vaga começa 14:00',
    person: { id: 'p5' },
    absences: [{ from: ['2026-10-21', '08:00'], to: ['2026-10-21', '14:00'] }],
    expected: { blockers: [], warnings: [] },
  },
  { id: 'UT-015', title: 'limite 44, carga 42 h, vaga de 3 h', person: { id: 'p5' }, loadHours: 42, expected: { blockers: [], warnings: ['over_limit'] } },
  { id: 'UT-016', title: 'limite 44, carga 41 h, vaga de 3 h', person: { id: 'p5' }, loadHours: 41, expected: { blockers: [], warnings: [] } },
  { id: 'UT-017', title: 'sem a função R2 numa vaga R2', person: { id: 'p5' }, slot: { jobRoleId: 'r2' }, expected: { blockers: [], warnings: ['role_not_enabled'] } },
  { id: 'UT-018', title: 'pessoa inativa', person: { id: 'p5', active: false }, expected: { blockers: ['person_inactive'], warnings: [] } },
  { id: 'UT-019', title: 'vaga de evento cancelado', person: { id: 'p5' }, slot: { eventStatus: 'cancelled' }, expected: { blockers: ['event_cancelled'], warnings: [] } },
  {
    id: 'UT-020',
    title: 'já ocupa outra vaga do mesmo evento',
    person: { id: 'p5' },
    others: [{ date: '2026-10-21', start: '14:00', end: '17:00', sameEvent: true }],
    expected: { blockers: ['same_event_twice'], warnings: [] },
  },
  {
    id: 'UT-021',
    title: 'vaga na semana 2026-10-12 com relógio em 21/10',
    person: { id: 'p5' },
    slot: { date: '2026-10-14' },
    expected: { blockers: ['week_past'], warnings: [] },
  },
];

// Dias da semana A sem conflito com a vaga padrão (quarta 21/10), 8 h cada.
const LOAD_DAYS = ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];

function hhmm(h: number) {
  const whole = Math.floor(h);
  return `${String(whole).padStart(2, '0')}:${String(Math.round((h - whole) * 60)).padStart(2, '0')}`;
}

/** Monta o cenário do caso sobre a semente; a vaga avaliada é `slot-x`. */
export function eligibilityContext(c: EligibilityCase): { ctx: WeekContext; personId: string; slotId: string } {
  const s = { ...DEFAULT_SLOT, ...c.slot };
  const event = (id: string, date: string, start: string, end: string, status: EventStatus = 'active'): EventLike => ({
    id,
    weekStart: weekStartOf(date),
    startsAt: zonedTime(date, start),
    endsAt: zonedTime(date, end),
    allDay: false,
    status,
    serviceTypeId: 't1',
  });
  const events: EventLike[] = [event('ev-x', s.date, s.start, s.end, s.eventStatus)];
  const slots: SlotLike[] = [{ id: 'slot-x', code: 'V1', eventId: 'ev-x', jobRoleId: s.jobRoleId }];
  const assignments: AssignmentLike[] = [];
  const add = (eventId: string, slotId: string, jobRoleId = 'r1') => {
    slots.push({ id: slotId, code: `V${slots.length + 1}`, eventId, jobRoleId });
    assignments.push({ slotId, eventId, personId: c.person.id, status: 'confirmed', locked: false });
  };

  let left = c.loadHours ?? 0;
  for (const day of LOAD_DAYS) {
    if (left <= 0) break;
    const h = Math.min(8, left);
    events.push(event(`ev-load-${day}`, day, '08:00', hhmm(8 + h)));
    add(`ev-load-${day}`, `slot-load-${day}`);
    left -= h;
  }
  (c.others ?? []).forEach((o, i) => {
    if (o.sameEvent) {
      add('ev-x', `slot-same-${i}`, 'r5');
    } else {
      events.push(event(`ev-other-${i}`, o.date, o.start, o.end));
      add(`ev-other-${i}`, `slot-other-${i}`);
    }
  });

  const people = SEED.people.map((p) =>
    p.id === c.person.id
      ? { ...p, active: c.person.active ?? p.active, weeklyLimitHours: c.person.weeklyLimitHours ?? p.weeklyLimitHours }
      : p,
  );
  const absences = (c.absences ?? []).map((a) => ({
    personId: c.person.id,
    startsAt: zonedTime(a.from[0], a.from[1]),
    endsAt: zonedTime(a.to[0], a.to[1]),
  }));
  return {
    ctx: {
      weekStart: SEED.weekA,
      now: new Date(SEED.now),
      people,
      events,
      slots,
      assignments,
      absences,
      jobRoles: SEED.jobRoles,
      serviceTypes: SEED.serviceTypes,
    },
    personId: c.person.id,
    slotId: 'slot-x',
  };
}
