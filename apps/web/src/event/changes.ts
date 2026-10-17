import { localDate } from '@cronograma/core';
import type { ChangeOriginal, EventRow } from '../data/catalog';
import { dayMonth, eventSpan } from '../week/model';

function spanOf(c: ChangeOriginal): string {
  if (!c.startsAt || !c.endsAt) return '';
  const start = new Date(c.startsAt);
  return `${dayMonth(localDate(start))} ${eventSpan({ starts_at: c.startsAt, ends_at: c.endsAt, all_day: Boolean(c.allDay) })}`;
}

/** Antes e depois da mudança vinda da agenda (US-011 AC-2), só com os campos que mudaram. */
export function changeLines(e: EventRow): { label: string; before: string; after: string }[] {
  const c = e.change_original;
  if (!c) return [];
  const now: ChangeOriginal = { title: e.title, location: e.location, description: e.description, startsAt: e.starts_at, endsAt: e.ends_at, allDay: e.all_day };
  const fields: [string, (x: ChangeOriginal) => string][] = [
    ['Título', (x) => x.title ?? ''],
    ['Horário', spanOf],
    ['Local', (x) => x.location ?? ''],
    ['Descrição', (x) => x.description ?? ''],
  ];
  const lines = fields.map(([label, get]) => ({ label, before: get(c) || 'vazio', after: get(now) || 'vazio' }));
  const changed = lines.filter((l) => l.before !== l.after);
  return changed.length > 0 ? changed : lines;
}
