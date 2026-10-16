// Leitura das células dos cronogramas: dia, horário, nomes, ano e mesclagens. Puro.
import { addDays, diffDays, formatDate, isoWeekday, isValidDate, localDate } from '../time.ts';
import { weekStartOf } from '../scheduling.ts';
import type { CellValue, LayoutId, MergeRange, ParsedEvent, ParsedWeek } from './types.ts';

/** Maiúsculas, sem acentos, espaços simples. */
export function norm(v: CellValue | undefined): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function text(v: CellValue | undefined): string {
  if (v === null || v === undefined || typeof v === 'boolean') return '';
  return String(v).replace(/\r/g, '').trim();
}

export function isBlank(row: CellValue[] | undefined): boolean {
  return !row || row.every((c) => text(c) === '');
}

// Emojis e enfeites que a equipe põe em volta da data ("✨25/03✨", "🎬 01/04✨").
function stripDecor(s: string): string {
  return s.replace(/[^\p{L}\p{N}\s/:.,()\-+–]/gu, ' ');
}

const WEEKDAYS: [RegExp, number][] = [
  [/^SEG/, 1],
  [/^TER/, 2],
  [/^QUA/, 3],
  [/^QUI/, 4],
  [/^SEX/, 5],
  [/^SAB/, 6],
  [/^DOM/, 7],
];

export function weekdayOf(word: string): number | null {
  const w = norm(word);
  for (const [re, n] of WEEKDAYS) if (re.test(w)) return n;
  return null;
}

export interface DayLabel {
  day: number;
  month: number;
  year: number | null;
  weekday: number | null;
}

export type DayParse = DayLabel | { invalid: string } | null;

const WEEKDAY_WORD = '(SEGUNDA|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO|SEG|TER|QUA|QUI|SEX|SAB|DOM)(?:-FEIRA)?\\.?';

/** Número de série do Excel (dias desde 30/12/1899) em data e hora de parede. */
export function fromSerial(serial: number): { date: string; time: string } {
  const days = Math.floor(serial);
  const minutes = Math.round((serial - days) * 1440);
  const date = addDays('1899-12-30', days + Math.floor(minutes / 1440));
  const m = minutes % 1440;
  return { date, time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
}

function dayResult(day: number, month: number, yearRaw: string | undefined, weekday: number | null): DayParse {
  let year: number | null = null;
  if (yearRaw) {
    year = Number(yearRaw);
    if (year < 100) year += 2000;
  }
  if (!isValidDate(year ?? 2024, month, day)) {
    return { invalid: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` };
  }
  return { day, month, year, weekday };
}

/**
 * Rótulo da coluna DIA ("05/10\nSEGUNDA", "✨25/03✨\nTERÇA", "10/08 Qua") ou número de série.
 * Só vale quando a célula é a data e o dia da semana; observações com datas no meio não contam.
 */
export function parseDayCell(v: CellValue | undefined): DayParse {
  if (typeof v === 'number') {
    if (v < 1 || v > 100_000) return null;
    const { date } = fromSerial(v);
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    return { day: d, month: m, year: y, weekday: isoWeekday(date) };
  }
  const s = norm(stripDecor(text(v)));
  if (!s) return null;
  const re = new RegExp(`^(?:${WEEKDAY_WORD}\\s*)?(\\d{1,2})\\s*/\\s*(\\d{1,2})(?:\\s*/\\s*(\\d{2,4}))?\\s*[-,.]?\\s*(?:${WEEKDAY_WORD})?$`);
  const m = re.exec(s);
  if (!m) return null;
  const weekday = weekdayOf(m[1] ?? m[5] ?? '');
  return dayResult(Number(m[2]), Number(m[3]), m[4], weekday);
}

/** Título de dia do layout em blocos: "SEGUNDA 22/08", "SEGUNDA 20/02 - FERIADO", "QUARTA-FEIRA · 05/08". */
export function parseDayTitle(v: CellValue | undefined): DayParse {
  const s = norm(stripDecor(text(v)));
  const re = new RegExp(`^${WEEKDAY_WORD}\\s*[-.,]*\\s*(\\d{1,2})\\s*/\\s*(\\d{1,2})(?:\\s*/\\s*(\\d{2,4}))?(?:\\s|$|-)`);
  const m = re.exec(s + ' ');
  if (!m) return null;
  return dayResult(Number(m[2]), Number(m[3]), m[4], weekdayOf(m[1] ?? ''));
}

export type TimeParse = { start: string; end: string | null } | { invalid: string } | null;

const TIME_TOKEN = /(\d{1,2})\s*(?:h?\s*:\s*(\d{1,3})|h\s*(\d{0,2}))/gi;

function hhmm(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "09:00 - 12:30", "19:00 -23:00", "14h às 15h", "17h:30" ou número de série (só o início). */
export function parseTimeCell(v: CellValue | undefined): TimeParse {
  if (typeof v === 'number') {
    if (v < 0 || v >= 1) return { invalid: String(v) };
    return { start: fromSerial(v).time, end: null };
  }
  const s = text(v);
  if (!s) return null;
  const tokens = [...s.matchAll(TIME_TOKEN)];
  const rest = s.replace(TIME_TOKEN, '').replace(/[\s\-–+aàsÀS]/g, '');
  if (tokens.length === 0 || tokens.length > 2 || rest !== '') return { invalid: s };
  const times: string[] = [];
  for (const t of tokens) {
    const h = Number(t[1]);
    const mins = t[2] ?? t[3] ?? '';
    const m = mins === '' ? 0 : Number(mins);
    if (h > 24 || m > 59 || (h === 24 && m > 0)) return { invalid: s };
    times.push(hhmm(h, m));
  }
  return { start: times[0] as string, end: times[1] ?? null };
}

// Palavras que aparecem na coluna de equipe e não são pessoas.
const NOT_PEOPLE = /^(TODOS?|TODAS?|EQUIPE|MONITOR(ES)?|TI|A DEFINIR|DEFINIR|NINGUEM|NENHUM|SEM|VAGO|-|\?|X|OK|DISPONIVEIS?)\b/;

/**
 * Nomes de uma célula de equipe: separados por "+", ",", "/", ";" ou " e ", sem o que vem entre
 * parênteses ("Bruno (presencial)"). Grupos ("Todos", "Equipe Marketing") ficam de fora; frases
 * longas voltam em `rejected` para a revisão.
 */
export function splitNames(v: CellValue | undefined): { names: string[]; rejected: string[] } {
  const s = text(v)
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/\n/g, ' + ');
  const names: string[] = [];
  const rejected: string[] = [];
  for (const part of s.split(/\s*(?:\+|,|\/|;|&|\s+e\s+)\s*/i)) {
    const name = part.replace(/[^\p{L}\p{N}\s.'-]/gu, ' ').replace(/\s+/g, ' ').replace(/^[.\s-]+|[\s-]+$/g, '');
    if (!name || !/\p{L}/u.test(name)) continue;
    if (NOT_PEOPLE.test(norm(name))) continue;
    if (name.split(' ').length > 4 || /\d/.test(name)) rejected.push(name);
    else if (!names.includes(name)) names.push(name);
  }
  return { names, rejected };
}

const CANCEL = /\b(CANCELAD[OA]S?|ADIAD[OA]S?|DESMARCAD[OA]S?)\b/;

export function looksCancelled(...texts: string[]): boolean {
  return texts.some((t) => CANCEL.test(norm(t)));
}

/** Mesclagem do padrão: linha inteira (separador ou observação do dia), da primeira ou segunda coluna até o fim. */
export function isStandardMerge(m: MergeRange, width: number): boolean {
  return m.s.c <= 1 && m.e.c >= width - 2;
}

/** Linhas (base 0) tocadas por mesclagens fora do padrão. */
export function oddMergeRows(merges: MergeRange[], width: number): Set<number> {
  const rows = new Set<number>();
  for (const m of merges) {
    if (isStandardMerge(m, width)) continue;
    for (let r = m.s.r; r <= m.e.r; r++) rows.add(r);
  }
  return rows;
}

/** Distância máxima, em dias, da última data lida para um ano contar como vizinho. */
export const ANCHOR_WINDOW = 400;

/**
 * Ano das datas sem ano de uma aba. Vale o ano em que mais dias da semana batem com as datas;
 * antes de tudo vem um ano a até 400 dias da maior data já lida no arquivo; no empate, o mais perto
 * dela, ou o mais recente que não passa de hoje.
 * Datas de janeiro numa aba que começa em dezembro caem no ano seguinte.
 */
export function inferYear(labels: DayLabel[], sheetName: string, anchor: string | null, now: Date): number {
  const explicit = labels.find((l) => l.year !== null)?.year;
  if (explicit) return explicit;
  const today = localDate(now);
  const thisYear = Number(today.slice(0, 4));
  const first = labels[0];
  if (!first) return thisYear;
  const nameYear = /(?:-|\b)(20\d{2}|\d{2})\s*(?:MANUT)?\s*$/i.exec(sheetName.trim());
  let best: { year: number; score: number; dist: number; near: number } | null = null;
  for (let y = thisYear - 12; y <= thisYear + 1; y++) {
    let score = 0;
    for (const l of labels) {
      if (l.weekday === null) continue;
      const yy = l.month < first.month - 6 ? y + 1 : y;
      if (isValidDate(yy, l.month, l.day) && isoWeekday(formatDate(yy, l.month, l.day)) === l.weekday) score++;
    }
    if (nameYear) {
      const ny = Number(nameYear[1]);
      if ((ny < 100 ? 2000 + ny : ny) === y) score += 0.5;
    }
    const firstDate = isValidDate(y, first.month, first.day) ? formatDate(y, first.month, first.day) : `${y}-01-01`;
    const dist = anchor
      ? Math.abs(diffDays(anchor, firstDate))
      : firstDate > addDays(today, 60)
        ? 100_000 + diffDays(today, firstDate)
        : diffDays(firstDate, today);
    // Perto da última data lida (até ANCHOR_WINDOW dias) vale mais que um acerto a mais de dia da semana.
    const near = anchor !== null && dist <= ANCHOR_WINDOW && score > 0 ? 1 : 0;
    const cand = { year: y, score, dist, near };
    if (
      !best ||
      near > best.near ||
      (near === best.near && (score > best.score || (score === best.score && dist < best.dist)))
    ) {
      best = cand;
    }
  }
  return (best as { year: number }).year;
}

/** O dia da semana escrito não bate com a data no ano deduzido: erro de digitação ("05/08 TERÇA" numa aba de setembro). */
export function weekdayMismatch(l: DayLabel, date: string): boolean {
  return l.weekday !== null && isoWeekday(date) !== l.weekday;
}

/** Data completa de um rótulo com o ano deduzido para a aba. */
export function labelDate(l: DayLabel, year: number, firstMonth: number): string {
  const y = l.year ?? (l.month < firstMonth - 6 ? year + 1 : year);
  return formatDate(y, l.month, l.day);
}

/** Agrupa eventos por semana (segunda a domingo). */
export function groupWeeks(events: ParsedEvent[], layout: LayoutId, sheet: string): ParsedWeek[] {
  const weeks = new Map<string, ParsedEvent[]>();
  for (const e of events) {
    const ws = weekStartOf(e.date);
    const list = weeks.get(ws);
    if (list) list.push(e);
    else weeks.set(ws, [e]);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, evs]) => ({ weekStart, layout, sheets: [sheet], events: evs }));
}

/** Fim do evento: no dia seguinte quando termina antes de começar (atravessa a meia-noite). */
export function endDateOf(date: string, start: string | null, end: string | null): string {
  if (!start || !end) return date;
  if (end === '24:00' || end <= start) return addDays(date, 1);
  return date;
}

export function normalizeEnd(end: string | null): string | null {
  return end === '24:00' ? '00:00' : end;
}
