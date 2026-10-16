// Fuso e datas de calendário. Toda data do produto é lida em America/Sao_Paulo pelo Intl,
// que conhece o histórico de horário de verão; datas de calendário são 'YYYY-MM-DD'.

export const TIME_ZONE = 'America/Sao_Paulo';

const DAY_MS = 86_400_000;

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function localParts(d: Date): LocalParts {
  const out: Record<string, number> = {};
  for (const p of partsFormat.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

export function formatDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Data de calendário em Brasília de um instante. */
export function localDate(d: Date): string {
  const p = localParts(d);
  return formatDate(p.year, p.month, p.day);
}

function dateToUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function utcMsToDate(ms: number): string {
  const d = new Date(ms);
  return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: string, days: number): string {
  return utcMsToDate(dateToUtcMs(date) + days * DAY_MS);
}

/** Dias inteiros de `from` até `to` (positivo quando `to` é depois). */
export function diffDays(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}

/** 1 = segunda ... 7 = domingo. */
export function isoWeekday(date: string): number {
  const wd = new Date(dateToUtcMs(date)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function offsetMinutes(at: Date): number {
  const p = localParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** Instante de uma hora de parede em Brasília ('HH:MM', '24:00' vale o fim do dia). */
export function zonedTime(date: string, time = '00:00'): Date {
  const [h, m] = time.split(':').map(Number);
  const wall = dateToUtcMs(date) + ((h ?? 0) * 60 + (m ?? 0)) * 60_000;
  // Duas passadas resolvem a troca de fuso em qualquer ponto do dia.
  let guess = wall - offsetMinutes(new Date(wall)) * 60_000;
  guess = wall - offsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess);
}

/** ISO 8601 com o deslocamento de Brasília, por exemplo 2026-10-21T09:00:00-03:00. */
export function toLocalIso(d: Date): string {
  const p = localParts(d);
  const off = offsetMinutes(d);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return (
    `${formatDate(p.year, p.month, p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** 'HH:MM' de um instante em Brasília. */
export function localTime(d: Date): string {
  const p = localParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 3_600_000;
}

export function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}
