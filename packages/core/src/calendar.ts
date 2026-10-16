// Comparação de um evento guardado com o que a Google Agenda devolveu (ADR-007).
// A impressão digital cobre só os campos exibidos; cor e lembretes são ignorados.
import { isWeekPast, weekStartOf } from './scheduling.ts';
import { sha256Hex } from './sha256.ts';
import { toLocalIso, zonedTime } from './time.ts';
import type { EventStatus } from './types.ts';

/** Campos exibidos de um evento da agenda, com instantes em ISO de Brasília. */
export interface EventSnapshot {
  title: string;
  location: string | null;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
}

/** Evento como a Calendar API devolve (events.list com singleEvents e showDeleted). */
export interface RemoteEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string | null;
  location?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  colorId?: string | null;
  reminders?: unknown;
  [extra: string]: unknown;
}

export interface StoredEvent extends EventSnapshot {
  googleEventId: string;
  weekStart: string;
  fingerprint: string;
  status: EventStatus;
  changeOriginal: EventSnapshot | null;
}

export type CalendarChange =
  | { kind: 'unchanged' }
  | { kind: 'new'; after: EventSnapshot; weekStart: string; fingerprint: string; notify: boolean }
  | {
      kind: 'changed';
      before: EventSnapshot;
      after: EventSnapshot;
      original: EventSnapshot; // estado antes da primeira mudança ainda não revista
      weekStart: string;
      fingerprint: string;
      notify: boolean;
    }
  | { kind: 'cancelled'; before: EventSnapshot; weekStart: string; notify: boolean }
  | { kind: 'restored'; after: EventSnapshot; weekStart: string; fingerprint: string; notify: boolean }
  | {
      kind: 'moved_week';
      from: string;
      to: string;
      before: EventSnapshot;
      after: EventSnapshot;
      fingerprint: string;
      notify: boolean;
    };

function instant(t: { dateTime?: string | null; date?: string | null } | null | undefined): Date | null {
  if (t?.dateTime) return new Date(t.dateTime);
  if (t?.date) return zonedTime(t.date);
  return null;
}

/** Converte o evento remoto nos campos exibidos; nulo quando não tem início ou fim. */
export function snapshotOf(remote: RemoteEvent): EventSnapshot | null {
  const start = instant(remote.start);
  const end = instant(remote.end);
  if (!start || !end) return null;
  return {
    title: (remote.summary ?? '').trim(),
    location: remote.location?.trim() || null,
    description: remote.description?.trim() || null,
    startsAt: toLocalIso(start),
    endsAt: toLocalIso(end),
    allDay: !remote.start?.dateTime,
  };
}

export function fingerprint(s: EventSnapshot): string {
  return sha256Hex(
    JSON.stringify([s.startsAt, s.endsAt, s.allDay, s.title, s.location ?? '', s.description ?? '']),
  );
}

function pick(s: EventSnapshot): EventSnapshot {
  return {
    title: s.title,
    location: s.location,
    description: s.description,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    allDay: s.allDay,
  };
}

/**
 * Classifica a diferença. `remote` nulo é evento que sumiu da janela e voltou 404 ou 410 no
 * events.get. Mudança em semana arquivada fica registrada com `notify=false` (US-011 EC-8).
 */
export function diffCalendarEvent(
  stored: StoredEvent | null,
  remote: RemoteEvent | null,
  now: Date = new Date(),
): CalendarChange {
  const after = remote && remote.status !== 'cancelled' ? snapshotOf(remote) : null;

  if (!stored) {
    if (!after) return { kind: 'unchanged' };
    const weekStart = weekStartOf(new Date(after.startsAt));
    return { kind: 'new', after, weekStart, fingerprint: fingerprint(after), notify: !isWeekPast(weekStart, now) };
  }

  const before = pick(stored);
  if (!after) {
    if (stored.status === 'cancelled') return { kind: 'unchanged' };
    return { kind: 'cancelled', before, weekStart: stored.weekStart, notify: !isWeekPast(stored.weekStart, now) };
  }

  const fp = fingerprint(after);
  const weekStart = weekStartOf(new Date(after.startsAt));
  if (stored.status === 'cancelled') {
    return { kind: 'restored', after, weekStart, fingerprint: fp, notify: !isWeekPast(weekStart, now) };
  }
  if (fp === stored.fingerprint) return { kind: 'unchanged' };
  if (weekStart !== stored.weekStart) {
    const notify = !isWeekPast(stored.weekStart, now) || !isWeekPast(weekStart, now);
    return { kind: 'moved_week', from: stored.weekStart, to: weekStart, before, after, fingerprint: fp, notify };
  }
  return {
    kind: 'changed',
    before,
    after,
    original: stored.changeOriginal ?? before,
    weekStart,
    fingerprint: fp,
    notify: !isWeekPast(weekStart, now),
  };
}
