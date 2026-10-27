import { describe, expect, it } from 'vitest';
import type { AssignmentRow, CrewRow, EventRow, JobRoleRow, PersonRoleRow, ServiceTypeRow, SlotRow } from '../data/catalog';
import { estimatedCrew, type WeekRows } from '../week/model';
import { previewActive, simulateCatalog, simulateWeek } from './sizePreview';

const role = (id: string, name: string) => ({ id, version: 1, code: id, name, sector_id: null, archived_at: null }) as JobRoleRow;
const ROLES = [role('op', 'Operador Evento'), role('aud', 'Operador Auditório'), role('cin', 'Cinegrafista'), role('fot', 'Fotografia'), role('pro', 'Produção'), role('aula', 'Operador Aula'), role('sup', 'Suporte')];
const type = (id: string, name: string) => ({ id, version: 1, code: id, name, keywords: [] as string[], no_team: false, archived_at: null }) as unknown as ServiceTypeRow;
const TYPES = [type('ev', 'EVENTO'), type('gr', 'GRAVACAO'), type('tr', 'TRANSMISSAO'), type('mba', 'AULA MBA')];
const crew = (t: string, r: string, quantity: number) => ({ id: `${t}:${r}`, version: 1, service_type_id: t, job_role_id: r, quantity, archived_at: null }) as CrewRow;
const CREW = [crew('ev', 'aud', 1), crew('ev', 'op', 1), crew('ev', 'cin', 2), crew('ev', 'fot', 2), crew('ev', 'pro', 2), crew('gr', 'cin', 1), crew('gr', 'pro', 1), crew('tr', 'aula', 1), crew('tr', 'sup', 1), crew('mba', 'aula', 1)];
const event = (id: string, typeId: string) => ({ id, version: 1, title: id, week_start: '2026-10-26', starts_at: '2026-10-27T13:00:00Z', ends_at: '2026-10-27T15:00:00Z', status: 'active', service_type_id: typeId }) as EventRow;
const slot = (id: string, eventId: string, roleId: string) => ({ id, version: 1, event_id: eventId, job_role_id: roleId, archived_at: null }) as SlotRow;

describe('simulação do porte no app local', () => {
  it('não liga nos testes nem quando o banco já tem o porte', () => {
    expect(previewActive(TYPES)).toBe(false);
  });

  it('EVENTO e GRAVACAO ganham porte e padrão, a TRANSMISSAO perde o Suporte e o resto fica igual', () => {
    const sim = simulateCatalog(TYPES, CREW, ROLES);
    const t = (id: string) => sim.types.find((x) => x.id === id) as ServiceTypeRow;
    expect(t('ev')).toMatchObject({ sized: true, default_size: 1 });
    expect(t('gr')).toMatchObject({ sized: true, default_size: 2 });
    expect(t('mba')).toMatchObject({ sized: false });
    const total = (typeId: string, size: number) => sim.crew.filter((c) => c.service_type_id === typeId && c.size === size).reduce((n, c) => n + c.quantity, 0);
    expect([total('ev', 1), total('ev', 2), total('ev', 3)]).toEqual([1, 3, 8]);
    expect([total('gr', 1), total('gr', 2), total('gr', 3)]).toEqual([1, 2, 4]);
    expect(sim.crew.filter((c) => c.service_type_id === 'tr').map((c) => c.job_role_id)).toEqual(['aula']);
  });

  it('DISPONIBILIZAR pede 1 Disponibilizador, que não ocupa horário, e reconhece "*DISPONIBILIZAR"', () => {
    const disp = { ...type('dp', 'DISPONIBILIZAR'), no_team: true, keywords: ['disponibilizar'] } as ServiceTypeRow;
    const sim = simulateCatalog([...TYPES, disp], CREW, ROLES);
    const role = sim.roles.find((r) => r.name === 'Disponibilizador');
    expect(role).toMatchObject({ no_hours: true });
    expect(sim.types.find((t) => t.id === 'dp')).toMatchObject({ no_team: false, keywords: ['disponibilizar', '*disponibilizar'] });
    expect(sim.crew.filter((c) => c.service_type_id === 'dp')).toMatchObject([{ job_role_id: role?.id, quantity: 1, size: 2 }]);
  });

  it('na semana montada, o EVENTO Simples mostra só a vaga do Operador Evento e mantém vaga com gente', () => {
    const slots = [slot('s-aud', 'e1', 'aud'), slot('s-op', 'e1', 'op'), slot('s-cin1', 'e1', 'cin'), slot('s-cin2', 'e1', 'cin'), slot('s-fot', 'e1', 'fot')];
    const assignments = [{ id: 'a1', version: 1, slot_id: 's-cin2', event_id: 'e1', person_id: 'p1', status: 'confirmed' } as AssignmentRow];
    const rows = { weekStart: '2026-10-26', week: null, events: [event('e1', 'ev')], slots, assignments, published: [], people: [], personRoles: [], absences: [], roles: ROLES, types: TYPES, crew: CREW } as WeekRows;
    const simple = simulateWeek(rows, {});
    expect(simple.slots.filter((s) => !s.archived_at).map((s) => s.id)).toEqual(['s-op', 's-cin2']);
    expect(estimatedCrew(simple.events[0] as EventRow, simple.types, simple.crew)).toEqual([{ job_role_id: 'op', quantity: 1, size: 1 }]);

    // Quem tem Operador Aula ganha Disponibilizador.
    const withAula = simulateWeek({ ...rows, personRoles: [{ id: 'pr1', version: 1, person_id: 'p1', job_role_id: 'aula', archived_at: null }] as PersonRoleRow[] }, {});
    const disp = withAula.roles.find((r) => r.name === 'Disponibilizador');
    expect(withAula.personRoles.filter((r) => r.person_id === 'p1').map((r) => r.job_role_id)).toEqual(['aula', disp?.id]);

    const medium = simulateWeek(rows, { e1: 2 });
    expect(medium.events[0]?.size).toBe(2);
    expect(medium.slots.filter((s) => !s.archived_at).map((s) => s.id)).toEqual(['s-op', 's-cin2', 's-fot']);
  });

  it('0020: a reunião marcada como aula pelo histórico vira reunião; a escolha à mão e a semana passada ficam', () => {
    const meeting = type('rm', 'REUNIAO MEDIADORES');
    const typed = (id: string, title: string, source: string, weekStart = '2099-01-05') =>
      ({ ...event(id, 'mba'), title, week_start: weekStart, type_source: source }) as EventRow;
    const rows = {
      weekStart: '2099-01-05', week: null, slots: [], assignments: [], published: [], people: [], personRoles: [], absences: [], roles: ROLES,
      types: [...TYPES, meeting], crew: CREW,
      events: [typed('e1', 'Reunião Mediadores POLI USP PRO', 'history'), typed('e2', 'Reunião Mediadores POLI USP PRO', 'admin'), typed('e3', 'POLI USP Indústria 4.0', 'history')],
    } as WeekRows;
    const sim = simulateWeek(rows, {});
    expect(sim.events.map((e) => [e.id, e.service_type_id, e.type_source])).toEqual([['e1', 'rm', 'keyword'], ['e2', 'mba', 'admin'], ['e3', 'mba', 'history']]);
    expect(simulateWeek({ ...rows, weekStart: '2020-01-06' }, {}).events[0]?.service_type_id).toBe('mba');
    // A troca à mão ensinou a série: o evento automático da mesma série segue a escolha.
    expect(simulateWeek(rows, {}, { 'reuniao mediadores poli usp pro': 'ev' }).events[0]?.service_type_id).toBe('ev');
  });
});
