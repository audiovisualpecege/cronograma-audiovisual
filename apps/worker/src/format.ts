import { localParts, localTime } from '@cronograma/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** "21/10" em Brasília. */
export function fmtDay(d: Date | string): string {
  const p = localParts(typeof d === 'string' ? new Date(`${d.slice(0, 10)}T12:00:00-03:00`) : d);
  return `${pad(p.day)}/${pad(p.month)}`;
}

/** "21/10 12:00" em Brasília, 24 horas (TechSpec, Textos). */
export function fmtWhen(d: Date): string {
  return `${fmtDay(d)} ${localTime(d)}`;
}
