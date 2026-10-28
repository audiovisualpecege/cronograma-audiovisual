import { describe, expect, it } from 'vitest';
import type { EventRow, ServiceTypeRow } from '../data/catalog';
import { googleColor, typeColor } from './googleColors';

const event = (fields: Partial<EventRow>) => ({ id: 'e1', title: 'Aula', week_start: '2026-10-26', starts_at: '', ends_at: '', status: 'active', ...fields }) as EventRow;
const types = [
  { id: 't1', name: 'AULA MBA' },
  { id: 't9', name: 'EVENTO' },
  { id: 't11', name: 'FOTOS' },
  { id: 't7', name: 'REUNIAO INTERNA' },
] as ServiceTypeRow[];

describe('cor do Google Agenda no cartão', () => {
  it('cada tipo com a cor que a equipe usa na agenda: verde aulas, amarelo produção, uva fotos, lilás reuniões', () => {
    expect(googleColor(event({ service_type_id: 't1' }), { types })).toBe('#76ad84');
    expect(googleColor(event({ service_type_id: 't9' }), { types })).toBe('#dabb63');
    expect(googleColor(event({ service_type_id: 't11' }), { types })).toBe('#9960b5');
    expect(googleColor(event({ service_type_id: 't7' }), { types })).toBe('#9b7cad');
    expect(googleColor(event({}), { types })).toBe('#9b7cad');
    expect(typeColor(undefined)).toBeNull();
  });

  it('a cor própria do evento no Google vence a do tipo; no app local, o arquivo lido do Google completa o banco', () => {
    expect(googleColor(event({ service_type_id: 't1', color_id: '11' }), { types })).toBe('#c05b3f');
    const local = { events: { 'g-1': '5' }, sources: {} };
    expect(googleColor(event({ service_type_id: 't1', google_event_id: 'g-1' }), { types, local })).toBe('#dabb63');
    expect(googleColor(event({ google_event_id: 'g-1', color_id: '7' }), { types, local })).toBe('#6389b8');
  });
});
