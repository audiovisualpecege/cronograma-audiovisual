import { buildHistoryIndex, type WeekContext } from '@cronograma/core';
import { describe, expect, it } from 'vitest';
import { fillOrder, proposeByHistory } from './historyProposal';

const WEEK = '2026-10-26';
const at = (h: number) => new Date(`2026-10-26T${String(h).padStart(2, '0')}:00:00-03:00`);
const person = (id: string, limit = 44) => ({ id, code: id.toUpperCase(), name: id, active: true, weeklyLimitHours: limit, roleIds: ['r1'] });
const event = (id: string, start: number, end: number) => ({
  id, weekStart: WEEK, startsAt: at(start), endsAt: at(end), allDay: false, periodStart: null, periodEnd: null,
  status: 'active' as const, serviceTypeId: 't1', noTeam: false, title: id,
});

function ctx(extra: Partial<WeekContext> = {}): WeekContext {
  return {
    weekStart: WEEK,
    now: new Date('2026-10-21T12:00:00-03:00'),
    people: [person('p1'), person('p2'), person('p3')],
    events: [event('aula', 9, 12), event('tarde', 14, 17)],
    slots: [
      { id: 's1', code: 'V1', eventId: 'aula', jobRoleId: 'r1' },
      { id: 's2', code: 'V2', eventId: 'aula', jobRoleId: 'r1' },
      { id: 's3', code: 'V3', eventId: 'tarde', jobRoleId: 'r1' },
    ],
    assignments: [],
    absences: [],
    jobRoles: [{ id: 'r1', code: 'R1' }],
    serviceTypes: [{ id: 't1', code: 'T1' }],
    ...extra,
  };
}

describe('fillOrder', () => {
  it('uma vaga de cada evento primeiro, depois o resto, e as reuniões por último', () => {
    const s = (id: string, eventId: string) => ({ id, eventId });
    const slots = [s('a1', 'A'), s('a2', 'A'), s('r1', 'R'), s('r2', 'R'), s('b1', 'B'), s('b2', 'B')];
    expect(fillOrder(slots, (e) => e === 'R').map((x) => x.id)).toEqual(['a1', 'b1', 'a2', 'b2', 'r1', 'r2']);
  });
});

describe('proposeByHistory', () => {
  it('quem mais fez vai primeiro; a mesma pessoa não fica em duas vagas do mesmo evento', () => {
    const history = buildHistoryIndex([
      ...Array.from({ length: 10 }, () => ({ personId: 'p2', jobRoleId: 'r1', serviceTypeId: 't1' })),
      ...Array.from({ length: 3 }, () => ({ personId: 'p3', jobRoleId: 'r1', serviceTypeId: 't1' })),
    ]);
    const drafts = proposeByHistory(ctx(), history);
    expect(drafts.get('s1')?.personId).toBe('p2');
    expect(drafts.get('s2')?.personId).not.toBe('p2');
    expect(drafts.get('s1')?.reason).toBe('fez esta função neste tipo (10 vezes); 0 h na semana');
  });

  it('o motivo diz quando foi a última vez', () => {
    const fact = (personId: string, weekStart: string, title: string) => ({ personId, jobRoleId: 'r1', serviceTypeId: 't1', weekStart, title });
    const history = buildHistoryIndex([fact('p2', '2026-10-19', 'aula'), fact('p2', '2026-10-12', 'aula'), fact('p3', '2026-08-03', 'outro')]);
    const drafts = proposeByHistory(ctx(), history);
    expect(drafts.get('s1')?.reason).toBe('fez este evento na semana passada (2 vezes em 8 semanas); 0 h na semana');
    const p3 = [...drafts.values()].find((d) => d.personId === 'p3');
    expect(p3?.reason).toBe('fez esta função neste tipo há 12 semanas (1 vez); 0 h na semana');
  });

  it('respeita o limite de horas: quem já está no teto fica de fora', () => {
    const drafts = proposeByHistory(ctx({ people: [person('p1', 3)] }), buildHistoryIndex([]));
    // p1 cabe numa vaga de 3 h; na segunda passaria do limite.
    expect([...drafts.values()].filter((d) => d.personId === 'p1')).toHaveLength(1);
  });

  it('vaga já confirmada não recebe sugestão e conta na carga', () => {
    const drafts = proposeByHistory(
      ctx({ assignments: [{ slotId: 's1', eventId: 'aula', personId: 'p1', status: 'confirmed', locked: false }] }),
      buildHistoryIndex([]),
    );
    expect(drafts.has('s1')).toBe(false);
    expect(drafts.get('s2')?.personId).not.toBe('p1');
  });
});
