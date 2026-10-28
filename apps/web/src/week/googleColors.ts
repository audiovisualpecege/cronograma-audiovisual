// Cores do Google Agenda nos cartões: a cor do próprio evento (colorId, de 1 a 11), senão a da agenda de origem.
// O serviço de fundo grava as duas (migração 0024). No app local, antes disso, um arquivo gerado por um script fora
// do repositório faz as vezes do banco (ver useLocalGoogleColors).
import { useEffect, useState } from 'react';
import type { CalendarSourceRow, EventRow } from '../data/catalog';

/** As 11 cores de evento do Google Agenda, com o nome que aparecem no menu do evento. */
export const GOOGLE_EVENT_COLORS: Readonly<Record<string, { name: string; hex: string }>> = {
  '1': { name: 'Lavanda', hex: '#7986cb' },
  '2': { name: 'Sálvia', hex: '#33b679' },
  '3': { name: 'Uva', hex: '#8e24aa' },
  '4': { name: 'Flamingo', hex: '#e67c73' },
  '5': { name: 'Banana', hex: '#f6bf26' },
  '6': { name: 'Tangerina', hex: '#f4511e' },
  '7': { name: 'Pavão', hex: '#039be5' },
  '8': { name: 'Grafite', hex: '#616161' },
  '9': { name: 'Mirtilo', hex: '#3f51b5' },
  '10': { name: 'Manjericão', hex: '#0b8043' },
  '11': { name: 'Tomate', hex: '#d50000' },
};

/** Cores lidas do Google por um script local, enquanto o banco não guarda (só no app local). */
export interface LocalGoogleColors {
  /** colorId de cada evento, pelo id do evento no Google. */
  events: Record<string, string>;
  /** Cor de cada agenda de origem (#rrggbb), pelo id da origem. */
  sources: Record<string, string>;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** A cor do cartão: a do evento no Google, senão a da agenda de origem; nula sem nenhuma das duas. */
export function googleColor(e: EventRow, sources: readonly CalendarSourceRow[], local: LocalGoogleColors | null = null): string | null {
  const id = e.color_id ?? (e.google_event_id ? local?.events[e.google_event_id] : undefined);
  const own = id ? GOOGLE_EVENT_COLORS[id]?.hex : undefined;
  if (own) return own;
  if (!e.calendar_source_id) return null;
  const source = sources.find((s) => s.id === e.calendar_source_id)?.color ?? local?.sources[e.calendar_source_id];
  return source && HEX.test(source) ? source : null;
}

const LOCAL_FILE = 'dev/cores-google.json';

/**
 * No app local (npm run dev), as cores que o script `cores-google` leu do Google, em
 * `apps/web/public/dev/cores-google.json` (fora do git). Na versão publicada, nada: as cores vêm do banco.
 */
export function useLocalGoogleColors(): LocalGoogleColors | null {
  const [colors, setColors] = useState<LocalGoogleColors | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return;
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}${LOCAL_FILE}`)
      .then((r) => (r.ok ? (r.json() as Promise<LocalGoogleColors>) : null))
      .then((c) => alive && c && setColors({ events: c.events ?? {}, sources: c.sources ?? {} }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return colors;
}
