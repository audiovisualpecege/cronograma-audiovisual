// Layout "oficial-2026": uma tabela por aba com cabeçalho na primeira linha e a coluna DIA
// ("05/10\nSEGUNDA") em cada evento. Descrição completa em ../LAYOUTS.md.
import {
  endDateOf,
  groupWeeks,
  inferYear,
  isBlank,
  labelDate,
  weekdayMismatch,
  looksCancelled,
  normalizeEnd,
  oddMergeRows,
  parseDayCell,
  parseDayTitle,
  parseTimeCell,
  text,
  type DayLabel,
} from '../cells.ts';
import type { CellValue, LayoutParser, ParsedEvent } from '../types.ts';
import { cellAt, isHeaderRow, joinNotes, readAssignments, readColumns, rowSummary } from './common.ts';

const HEADER_SEARCH = 3;

function headerIndex(rows: CellValue[][]): number {
  for (let i = 0; i < Math.min(HEADER_SEARCH, rows.length); i++) {
    if (isHeaderRow(rows[i])) return i;
  }
  return -1;
}

export const oficial2026: LayoutParser = {
  id: 'oficial-2026',

  detect(sheet) {
    const h = headerIndex(sheet.rows);
    if (h < 0) return false;
    // No layout em blocos o dia vem num título acima do cabeçalho; aqui não há título de dia.
    for (let i = 0; i < Math.min(6, sheet.rows.length); i++) {
      if (parseDayTitle(sheet.rows[i]?.[0] ?? null)) return false;
    }
    const cols = readColumns(sheet.rows[h] ?? []);
    return cols.time >= 1;
  },

  parse(sheet, ctx) {
    const h = headerIndex(sheet.rows);
    const cols = readColumns(sheet.rows[h] ?? []);
    const dayCol = 0;
    const odd = oddMergeRows(sheet.merges, cols.width);

    const labels: DayLabel[] = [];
    for (let r = h + 1; r < sheet.rows.length; r++) {
      const d = parseDayCell(sheet.rows[r]?.[dayCol] ?? null);
      if (d && !('invalid' in d)) labels.push(d);
    }
    const year = inferYear(labels, sheet.name, ctx.anchor, ctx.now);
    const firstMonth = labels[0]?.month ?? 1;

    const events: ParsedEvent[] = [];
    for (let r = h + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const rowNumber = r + 1;
      if (isBlank(row) || isHeaderRow(row)) continue;
      if (odd.has(r)) {
        ctx.skip({ row: rowNumber, reason: 'celula_mesclada', detail: rowSummary(row) });
        continue;
      }
      const day = parseDayCell(row[dayCol] ?? null);
      if (day && 'invalid' in day) {
        ctx.skip({ row: rowNumber, reason: 'data_invalida', detail: `Data ${day.invalid}: ${rowSummary(row)}` });
        continue;
      }
      const title = cellAt(row, cols.title);
      if (!day) {
        const hasEvent = title !== '' && parseTimeCell(row[cols.time] ?? null) !== null;
        ctx.skip({ row: rowNumber, reason: hasEvent ? 'sem_data' : 'observacao', detail: rowSummary(row) });
        continue;
      }
      const time = parseTimeCell(row[cols.time] ?? null);
      if (time && 'invalid' in time) {
        ctx.skip({ row: rowNumber, reason: 'horario_invalido', detail: `Horário ${time.invalid}: ${rowSummary(row)}` });
        continue;
      }
      if (!title) {
        // Linha só com o dia preenchido é sobra da planilha.
        if (row.slice(1).every((c) => text(c) === '')) continue;
        ctx.skip({ row: rowNumber, reason: 'observacao', detail: rowSummary(row) });
        continue;
      }
      const date = labelDate(day, year, firstMonth);
      if (weekdayMismatch(day, date)) {
        ctx.skip({ row: rowNumber, reason: 'data_invalida', detail: `Dia da semana não bate com ${date.slice(8, 10)}/${date.slice(5, 7)}: ${rowSummary(row)}` });
        continue;
      }
      const notes = cellAt(row, cols.notes);
      events.push({
        date,
        endDate: endDateOf(date, time?.start ?? null, time?.end ?? null),
        start: time?.start ?? null,
        end: normalizeEnd(time?.end ?? null),
        allDay: !time,
        title,
        location: cellAt(row, cols.location) || null,
        notes: joinNotes(notes, cellAt(row, cols.links)),
        typeLabel: null,
        cancelled: looksCancelled(title, notes),
        externalId: null,
        assignments: readAssignments(row, cols, rowNumber, ctx),
        source: { sheet: sheet.name, row: rowNumber },
      });
    }
    return groupWeeks(events, 'oficial-2026', sheet.name);
  },
};
