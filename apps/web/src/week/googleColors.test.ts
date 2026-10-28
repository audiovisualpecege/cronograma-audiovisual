import { describe, expect, it } from 'vitest';
import type { CalendarSourceRow, EventRow } from '../data/catalog';
import { googleColor } from './googleColors';

const event = (fields: Partial<EventRow>) => ({ id: 'e1', title: 'Aula', week_start: '2026-10-26', starts_at: '', ends_at: '', status: 'active', calendar_source_id: 'S1', ...fields }) as EventRow;
const sources = [{ id: 'S1', color: '#33b679' }] as CalendarSourceRow[];

describe('cor do Google Agenda no cartão', () => {
  it('a cor do próprio evento vence a da agenda; sem ela, vale a da agenda; sem nenhuma, nula', () => {
    expect(googleColor(event({ color_id: '11' }), sources)).toBe('#d50000');
    expect(googleColor(event({}), sources)).toBe('#33b679');
    expect(googleColor(event({ calendar_source_id: null }), sources)).toBeNull();
    expect(googleColor(event({ calendar_source_id: 'S2' }), sources)).toBeNull();
  });

  it('no app local, o arquivo lido do Google completa o que o banco ainda não tem', () => {
    const local = { events: { 'g-1': '5' }, sources: { S2: '#039be5' } };
    expect(googleColor(event({ google_event_id: 'g-1' }), [], local)).toBe('#f6bf26');
    expect(googleColor(event({ calendar_source_id: 'S2' }), [], local)).toBe('#039be5');
    // O banco vence o arquivo.
    expect(googleColor(event({ google_event_id: 'g-1', color_id: '7' }), [], local)).toBe('#039be5');
  });
});
