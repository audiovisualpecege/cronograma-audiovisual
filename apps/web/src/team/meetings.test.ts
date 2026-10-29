import { describe, expect, it } from 'vitest';
import type { EventRow, ServiceTypeRow } from '../data/catalog';
import { filterActivities, myWeek, NO_FILTER, publishedWeek, type TeamRows } from './model';

const WEEK = '2026-10-26';
const ev = (id: string, typeId: string, start = '2026-10-27T10:00:00-03:00') =>
  ({ id, version: 1, updated_at: '', title: id, week_start: WEEK, starts_at: start, ends_at: '2026-10-27T11:00:00-03:00', status: 'active', service_type_id: typeId }) as EventRow;
const type = (id: string, extra: Partial<ServiceTypeRow>) => ({ id, version: 1, updated_at: '', code: id, name: id, keywords: [], no_team: false, archived_at: null, ...extra }) as ServiceTypeRow;

const rows: TeamRows = {
  weekStart: WEEK,
  week: { id: 'w', version: 1, updated_at: '', week_start: WEEK, state: 'published', revision: 1 },
  events: [ev('Reunião Edição', 'reu-ed'), ev('Reunião Interna', 'reu-int'), ev('Gravação', 'grav', '2026-10-27T14:00:00-03:00')],
  published: [{ id: 'p1', version: 1, updated_at: '', week_id: 'w', revision: 1, event_id: 'Gravação', slot_id: 's1', job_role_id: 'cine', person_id: 'ana', notes: null }],
  people: [
    { id: 'ana', name: 'Ana', sector_id: 'producao' },
    { id: 'bia', name: 'Bia', sector_id: 'edicao' },
  ],
  roles: [{ id: 'cine', version: 1, updated_at: '', code: 'R1', name: 'Cinegrafista', sector_id: 'producao', archived_at: null }],
  sectors: [],
  types: [type('reu-ed', { no_team: true, sector_ids: ['edicao'] }), type('reu-int', { no_team: true }), type('grav', {})],
  absences: [],
};

describe('reuniões de setor na visão da equipe', () => {
  it('entram sem escala, só as ligadas a setores', () => {
    const week = publishedWeek(rows);
    expect(week.activities.map((a) => [a.event.id, a.meetingSectors ?? null])).toEqual([
      ['Reunião Edição', ['edicao']],
      ['Gravação', null],
    ]);
  });

  it('aparecem na semana de quem é do setor, e não na dos outros', () => {
    const now = new Date('2026-10-26T08:00:00-03:00');
    const ids = (personId: string) => myWeek(rows, personId, now, null).days.flatMap((d) => d.activities.map((a) => a.event.id));
    expect(ids('bia')).toEqual(['Reunião Edição']);
    expect(ids('ana')).toEqual(['Gravação']);
  });

  it('o filtro da Equipe acha a reunião pelo setor ou pela pessoa do setor; pela função, não', () => {
    const all = publishedWeek(rows).activities;
    const ids = (f: Partial<typeof NO_FILTER>) => filterActivities(all, { ...NO_FILTER, ...f }, rows).map((a) => a.event.id);
    expect(ids({ sectorId: 'edicao' })).toEqual(['Reunião Edição']);
    expect(ids({ personId: 'bia' })).toEqual(['Reunião Edição']);
    expect(ids({ sectorId: 'producao' })).toEqual(['Gravação']);
    expect(ids({ roleId: 'cine' })).toEqual(['Gravação']);
  });
});
