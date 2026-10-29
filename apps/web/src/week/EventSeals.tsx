import { localDate } from '@cronograma/core';
import type { EventRow } from '../data/catalog';
import { Seal } from './Seal';

/** Selos do evento: hoje, interna, mudou, cancelado e, para administradores, restaurado, duplicado e sem escala. */
export function EventSeals({ event, today, team = false, noToday = false }: { event: EventRow; today: string; team?: boolean; noToday?: boolean }) {
  const first = localDate(new Date(event.starts_at));
  const last = localDate(new Date(Math.max(Date.parse(event.starts_at), Date.parse(event.ends_at) - 1)));
  return (
    <>
      {!noToday && first <= today && today <= last && <Seal kind="hoje">hoje</Seal>}
      {event.origin === 'internal' && <Seal kind="soft">interna</Seal>}
      {event.status === 'changed' && <Seal kind="mudou">mudou</Seal>}
      {event.status === 'cancelled' && <Seal kind="cancelado">cancelado</Seal>}
      {!team && event.restored && <Seal>restaurado</Seal>}
      {!team && event.duplicate_group && <Seal>possível duplicado</Seal>}
      {!team && event.review_pending && event.status !== 'changed' && event.status !== 'cancelled' && <Seal>sem escala</Seal>}
    </>
  );
}
