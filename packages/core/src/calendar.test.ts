import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffCalendarEvent, fingerprint, snapshotOf, type RemoteEvent, type StoredEvent } from './calendar.ts';
import { SEED } from './cases/seed.ts';
import { sha256Hex } from './sha256.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SEED.now));
});
afterEach(() => {
  vi.useRealTimers();
});

function remote(overrides: Partial<RemoteEvent> = {}): RemoteEvent {
  return {
    id: 'g1',
    status: 'confirmed',
    summary: 'Gravação Aula 3',
    location: 'Estúdio Água',
    description: 'Turma 261',
    start: { dateTime: '2026-10-21T09:00:00-03:00' },
    end: { dateTime: '2026-10-21T12:00:00-03:00' },
    colorId: '1',
    reminders: { useDefault: true },
    ...overrides,
  };
}

function stored(r: RemoteEvent, extra: Partial<StoredEvent> = {}): StoredEvent {
  const snap = snapshotOf(r);
  if (!snap) throw new Error('evento sem horário');
  return { ...snap, googleEventId: r.id, weekStart: '2026-10-19', fingerprint: fingerprint(snap), status: 'active', changeOriginal: null, ...extra };
}

describe('diferença da agenda', () => {
  it('UT-036 sem evento guardado e remoto ativo é novo', () => {
    expect(diffCalendarEvent(null, remote())).toMatchObject({ kind: 'new', weekStart: '2026-10-19', notify: true });
  });

  it('UT-037 título muda de "Gravação Aula 3" para "Gravação Aula 4"', () => {
    const change = diffCalendarEvent(stored(remote()), remote({ summary: 'Gravação Aula 4' }));
    expect(change).toMatchObject({
      kind: 'changed',
      before: { title: 'Gravação Aula 3' },
      after: { title: 'Gravação Aula 4' },
      notify: true,
    });
  });

  it.each([
    ['UT-038 só cor e lembretes mudam', remote({ colorId: '7', reminders: { useDefault: false, overrides: [] } })],
    ['mesmo evento sem mudança', remote()],
  ])('%s: unchanged', (_name, r) => {
    expect(diffCalendarEvent(stored(remote()), r)).toEqual({ kind: 'unchanged' });
  });

  it.each([
    ['UT-039 remoto com status cancelled', remote({ status: 'cancelled' })],
    ['remoto sumiu e events.get voltou 404', null],
  ])('%s: cancelled', (_name, r) => {
    expect(diffCalendarEvent(stored(remote()), r)).toMatchObject({ kind: 'cancelled', before: { title: 'Gravação Aula 3' }, notify: true });
  });

  it('UT-040 guardado cancelado e remoto ativo é restaurado', () => {
    expect(diffCalendarEvent(stored(remote(), { status: 'cancelled' }), remote())).toMatchObject({ kind: 'restored', weekStart: '2026-10-19' });
  });

  it('UT-041 início muda de 21/10 para 28/10: muda de semana', () => {
    const next = remote({ start: { dateTime: '2026-10-28T09:00:00-03:00' }, end: { dateTime: '2026-10-28T12:00:00-03:00' } });
    expect(diffCalendarEvent(stored(remote()), next)).toMatchObject({ kind: 'moved_week', from: '2026-10-19', to: '2026-10-26' });
  });

  it('UT-042 segunda mudança mantém o original guardado e troca só o atual', () => {
    const afterFirst = stored(remote({ summary: 'Gravação Aula 4' }), { changeOriginal: snapshotOf(remote()) });
    const change = diffCalendarEvent(afterFirst, remote({ summary: 'Gravação Aula 5' }));
    expect(change).toMatchObject({
      kind: 'changed',
      original: { title: 'Gravação Aula 3' },
      before: { title: 'Gravação Aula 4' },
      after: { title: 'Gravação Aula 5' },
    });
  });

  it.each([
    ['UT-043 mudança em evento da semana 2026-10-12', 'changed'],
    ['cancelamento em semana arquivada', 'cancelled'],
  ])('%s: registrada com notify=false', (_name, kind) => {
    const old = remote({ start: { dateTime: '2026-10-14T09:00:00-03:00' }, end: { dateTime: '2026-10-14T12:00:00-03:00' } });
    const next = kind === 'changed' ? { ...old, summary: 'Outro título' } : null;
    const change = diffCalendarEvent(stored(old, { weekStart: '2026-10-12' }), next);
    expect(change).toMatchObject({ kind, notify: false });
  });

  it('evento de dia inteiro usa as datas da agenda, com fim exclusivo', () => {
    const snap = snapshotOf(remote({ start: { date: '2026-10-21' }, end: { date: '2026-10-22' } }));
    expect(snap).toMatchObject({ allDay: true, startsAt: '2026-10-21T00:00:00-03:00', endsAt: '2026-10-22T00:00:00-03:00' });
  });

  it('a impressão digital é o SHA-256 dos campos exibidos', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    for (const text of ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'ação ✨ '.repeat(300)]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
    expect(fingerprint(stored(remote()))).toHaveLength(64);
  });
});
