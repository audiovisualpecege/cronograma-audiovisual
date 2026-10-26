import { describe, expect, it } from 'vitest';
import { CREW_ROWS, eventRow, ROLE_ROWS, TYPE_ROWS, WEEK_B } from '../../test/weekFixtures';
import type { AssignmentRow, CrewRow, EventRow, JobRoleRow, ServiceTypeRow, SlotRow } from '../data/catalog';
import { activityKind, chipState, eventAlerts, isPlanned, plannedRows, shortTitle, slotKeys, timeOffAbsences } from './board';
import type { WeekRows } from './model';

const types = TYPE_ROWS as unknown as ServiceTypeRow[];

function rows(extra: Partial<WeekRows> = {}): WeekRows {
  return {
    weekStart: WEEK_B,
    week: null,
    events: [],
    slots: [],
    assignments: [],
    published: [],
    people: [],
    personRoles: [],
    absences: [],
    roles: ROLE_ROWS as unknown as JobRoleRow[],
    types,
    crew: CREW_ROWS as unknown as CrewRow[],
    ...extra,
  };
}

describe('grade da semana', () => {
  it('semana sem montagem: vagas previstas pela equipe do tipo, abertas, só nos eventos que pedem equipe', () => {
    const events = [eventRow('a') as unknown as EventRow, eventRow('b', { service_type_id: 't4' }) as unknown as EventRow, eventRow('c', { ignored: true }) as unknown as EventRow];
    const out = plannedRows(rows({ events }));
    // T1: 1 R1 e 1 R5.
    expect(out.slots.map((s) => [s.event_id, s.job_role_id])).toEqual([
      ['a', 'r1'],
      ['a', 'r5'],
    ]);
    expect(out.slots.every((s) => isPlanned(s.id))).toBe(true);
    expect(out.assignments.every((a) => a.person_id === null)).toBe(true);
    // Semana montada fica como está.
    const built = rows({ week: { id: 'w' } as never, events });
    expect(plannedRows(built)).toBe(built);
  });

  it('a chave da vaga é a mesma antes e depois da montagem (evento, função e ordem na função)', () => {
    const s = (id: string, event: string, role: string) => ({ id, event_id: event, job_role_id: role, archived_at: null }) as SlotRow;
    const planned = slotKeys([s('plan:a:r1:0', 'a', 'r1'), s('plan:a:r1:1', 'a', 'r1'), s('plan:a:r5:0', 'a', 'r5')]);
    const real = slotKeys([s('v9', 'a', 'r5'), s('v2', 'a', 'r1'), s('v10', 'a', 'r1')]);
    expect([...planned.values()].sort()).toEqual([...real.values()].sort());
    expect(real.get('v2')).toBe('a|r1|0');
    expect(real.get('v10')).toBe('a|r1|1');
  });

  it('ficha: confirmada, sugestão (proposta ou sugerida) e aberta', () => {
    const a = (person: string | null, status: AssignmentRow['status']) => ({ person_id: person, status }) as AssignmentRow;
    expect(chipState(a('p1', 'confirmed'), undefined)).toBe('confirmed');
    expect(chipState(a('p1', 'proposed'), undefined)).toBe('suggested');
    expect(chipState(a(null, null), { personId: 'p2', reason: '' })).toBe('suggested');
    expect(chipState(a(null, null), undefined)).toBe('open');
  });

  it('avisos do evento: sem tipo, mudou, equipe típica mudou e sem vagas na semana montada', () => {
    const e = (fields: Record<string, unknown>) => eventRow('x', fields) as unknown as EventRow;
    expect(eventAlerts(e({ service_type_id: null }), 0, false, types)).toEqual(['tipo de serviço a definir']);
    expect(eventAlerts(e({ status: 'changed', crew_outdated: true }), 2, true, types)).toEqual(['mudou na agenda', 'a equipe típica do tipo mudou']);
    expect(eventAlerts(e({}), 0, true, types)).toEqual(['sem vagas']);
    expect(eventAlerts(e({ status: 'cancelled' }), 1, true, types)).toEqual(['cancelado na agenda: desfaça a escala']);
  });

  it('separa as famílias pela cor: aula, produção, reunião e sem equipe', () => {
    const t = (name: string, extra: Partial<ServiceTypeRow> = {}) => ({ id: name, code: name, name, keywords: [], no_team: false, archived_at: null, ...extra }) as unknown as ServiceTypeRow;
    const all = [t('AULA MBA'), t('GRAVACAO'), t('REUNIAO EDICAO'), t('FOLGA', { no_team: true }), t('DISPONIBILIZAR')];
    const e = (typeId: string) => ({ id: typeId, title: 'x', status: 'active', service_type_id: typeId }) as EventRow;
    expect(['AULA MBA', 'GRAVACAO', 'REUNIAO EDICAO', 'FOLGA', 'DISPONIBILIZAR'].map((id) => activityKind(e(id), all))).toEqual(['aula', 'producao', 'reuniao', 'marcacao', 'aula']);
    expect(shortTitle('Curso X\nDisciplina: Y')).toBe('Curso X');
  });

  it('folga da agenda vale como ausência dos dias inteiros até ser desmarcada; a cadastrada já está no contexto', () => {
    const items = [
      { key: 'e:1', personId: 'p3', name: 'P3', kind: 'ferias' as const, from: '2026-10-26', to: '2026-10-30', agendaTitle: 'Férias P3' },
      { key: 'e:2', personId: 'p4', name: 'P4', kind: 'folga' as const, from: '2026-10-27', to: '2026-10-27', agendaTitle: 'Folga P4' },
      { key: 'a:3', personId: 'p5', name: 'P5', kind: 'folga' as const, from: '2026-10-27', to: '2026-10-27', agendaTitle: null },
    ];
    expect(timeOffAbsences(items, new Set(['e:2']))).toEqual([{ personId: 'p3', startsAt: new Date('2026-10-26T03:00:00Z'), endsAt: new Date('2026-10-31T03:00:00Z') }]);
  });
});
