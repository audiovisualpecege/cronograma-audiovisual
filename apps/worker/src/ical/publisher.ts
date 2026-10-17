// Agenda pessoal assinável (US-024): o worker grava ical/<token>.ics no Storage só com as atividades publicadas
// da pessoa (ADR-006, ADR-011). Revogar ou desativar apaga o arquivo; o link antigo passa a dar 404.
import { addDays, localParts, weekStartOf } from '@cronograma/core';
import type { Clock } from '../clock.ts';
import type { JobResult } from '../queue.ts';
import type { IcalFeed, IcalItem, IcalStore } from '../store.ts';

/** Semanas para trás que ainda entram no feed. */
export const ICAL_PAST_WEEKS = 8;

const pad = (n: number) => String(n).padStart(2, '0');

function localStamp(d: Date): string {
  const p = localParts(d);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

function localDay(d: Date): string {
  const p = localParts(d);
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobra linhas em 75 octetos, como pede a RFC 5545, sem partir caractere UTF-8. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// Brasília sem horário de verão desde 2019.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/Sao_Paulo',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:-0300',
  'TZOFFSETTO:-0300',
  'TZNAME:-03',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function eventLines(it: IcalItem, stamp: string): string[] {
  const usePeriod = it.all_day && it.period_start && it.period_end;
  const start = new Date(usePeriod ? (it.period_start as string) : it.starts_at);
  const end = new Date(usePeriod ? (it.period_end as string) : it.ends_at);
  const when = it.all_day && !usePeriod
    ? [`DTSTART;VALUE=DATE:${localDay(start)}`, `DTEND;VALUE=DATE:${localDay(end > start ? end : new Date(start.getTime() + 86_400_000))}`]
    : [`DTSTART;TZID=America/Sao_Paulo:${localStamp(start)}`, `DTEND;TZID=America/Sao_Paulo:${localStamp(end)}`];
  const description = [
    `Função: ${it.role_name}`,
    ...(it.colleagues.length > 0 ? [`Equipe: ${it.colleagues.join(', ')}`] : []),
    ...(it.notes ? [`Observações: ${it.notes}`] : []),
  ].join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${it.event_id}-${it.job_role_id}@cronograma-audiovisual`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${escapeText(`${it.title || 'Atividade'} (${it.role_name})`)}`,
    ...(it.location ? [`LOCATION:${escapeText(it.location)}`] : []),
    `DESCRIPTION:${escapeText(description)}`,
    'END:VEVENT',
  ];
}

/** Feed .ics da pessoa: só as atividades publicadas dela, ordenadas pelo início. */
export function buildIcal(feed: IcalFeed, now: Date): string {
  const stamp = utcStamp(now);
  const items = [...feed.items].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.event_id.localeCompare(b.event_id));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chiaro Filmes//Cronograma Audiovisual//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`Escala de ${feed.person.name}`)}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
    ...items.flatMap((it) => eventLines(it, stamp)),
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export class IcalPublisher {
  constructor(
    private store: IcalStore,
    private clock: Pick<Clock, 'now'>,
  ) {}

  async publish(personId: string): Promise<JobResult> {
    const now = this.clock.now();
    const feed = await this.store.icalFeed(personId, addDays(weekStartOf(now), -7 * ICAL_PAST_WEEKS));
    if (!feed?.person.ical_token) return { published: false, reason: 'sem link' };
    if (!feed.person.active) {
      // Pessoa desativada: o link para de funcionar (US-024 EC-3).
      await this.store.removeIcal(feed.person.ical_token);
      await this.store.clearIcalToken(personId);
      return { published: false, reason: 'pessoa inativa' };
    }
    await this.store.uploadIcal(feed.person.ical_token, buildIcal(feed, now));
    return { published: true, events: feed.items.length };
  }

  async revoke(personId: string, token: string | null): Promise<JobResult> {
    if (token) await this.store.removeIcal(token);
    const feed = await this.store.icalFeed(personId, weekStartOf(this.clock.now()));
    if (feed && !feed.person.active && feed.person.ical_token) {
      await this.store.removeIcal(feed.person.ical_token);
      await this.store.clearIcalToken(personId);
    }
    return { revoked: Boolean(token) };
  }
}
