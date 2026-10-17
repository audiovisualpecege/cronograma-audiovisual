import { localParts } from '@cronograma/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** "dd/mm hh:mm" no fuso de Brasília, 24 h. */
export function formatStamp(iso: string | Date): string {
  const p = localParts(typeof iso === 'string' ? new Date(iso) : iso);
  return `${pad(p.day)}/${pad(p.month)} ${pad(p.hour)}:${pad(p.minute)}`;
}
