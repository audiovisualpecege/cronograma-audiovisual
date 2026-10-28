// Cores do Google Agenda nos cartões. Na agenda da equipe, a cor segue o tipo do trabalho (amarelo produção,
// verde disponibilizar e transmitir, uva fotos, lilás reuniões...), e é isso que o cartão repete. Se alguém der uma
// cor própria ao evento no Google (colorId, gravado pelo serviço de fundo na migração 0024), ela vence. Os tons são
// os do Google no tema escuro, medidos na agenda da equipe (28/10/2026), para o cartão ficar igual ao que se vê lá.
import { useEffect, useState } from 'react';
import type { CalendarSourceRow, EventRow, ServiceTypeRow } from '../data/catalog';

/** As 11 cores de evento do Google Agenda (pelo colorId), com o nome do menu do evento e o tom do tema escuro. */
export const GOOGLE_EVENT_COLORS: Readonly<Record<string, { name: string; hex: string }>> = {
  '1': { name: 'Lavanda', hex: '#878cbe' },
  '2': { name: 'Sálvia', hex: '#76ad84' },
  '3': { name: 'Uva', hex: '#9960b5' },
  '4': { name: 'Flamingo', hex: '#d0837d' },
  '5': { name: 'Banana', hex: '#dabb63' },
  '6': { name: 'Tangerina', hex: '#ca6f49' },
  '7': { name: 'Pavão', hex: '#6389b8' },
  '8': { name: 'Grafite', hex: '#7c7c7c' },
  '9': { name: 'Mirtilo', hex: '#7373bd' },
  '10': { name: 'Manjericão', hex: '#618f64' },
  '11': { name: 'Tomate', hex: '#c05b3f' },
};

/** Lilás das reuniões, folgas e marcações de dia inteiro na agenda da equipe (a cor da agenda). */
const LILAS = '#9b7cad';

/** A cor de cada tipo, como a equipe usa na agenda. Tipo fora da lista fica lilás, como na agenda. */
const TYPE_COLOR: Readonly<Record<string, string>> = {
  'AULA MBA': '2',
  'AULA SOLUTION': '2',
  DISPONIBILIZAR: '2',
  TRANSMISSAO: '2',
  'CURSO ONLINE': '7',
  WEBINAR: '7',
  EVENTO: '5',
  GRAVACAO: '5',
  'GRAVACAO EXTERNA': '5',
  PODCAST: '5',
  FOTOS: '3',
  'EDICAO FOTOS': '3',
  'NAO ESCALAR': '6',
};

/** Cores lidas do Google por um script local, enquanto o banco não guarda (só no app local). */
export interface LocalGoogleColors {
  /** colorId de cada evento, pelo id do evento no Google. */
  events: Record<string, string>;
  /** Cor de cada agenda de origem (#rrggbb), pelo id da origem. */
  sources: Record<string, string>;
}

export interface ColorContext {
  types: readonly ServiceTypeRow[];
  sources?: readonly CalendarSourceRow[];
  local?: LocalGoogleColors | null;
}

/** A cor do tipo como na agenda da equipe; sem tipo, nula. */
export function typeColor(type: Pick<ServiceTypeRow, 'name'> | undefined): string | null {
  if (!type) return null;
  const id = TYPE_COLOR[type.name.toUpperCase()];
  return id ? (GOOGLE_EVENT_COLORS[id]?.hex ?? LILAS) : LILAS;
}

/** A cor do cartão: a própria do evento no Google, senão a do tipo, senão a lilás da agenda. */
export function googleColor(e: EventRow, { types, local = null }: ColorContext): string {
  const id = e.color_id ?? (e.google_event_id ? local?.events[e.google_event_id] : undefined);
  const own = id ? GOOGLE_EVENT_COLORS[id]?.hex : undefined;
  return own ?? typeColor(types.find((t) => t.id === e.service_type_id)) ?? LILAS;
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
