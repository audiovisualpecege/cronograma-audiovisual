// Layout "oficial-2022-blocos": cada dia é um bloco com título ("SEGUNDA 22/08"), observações do
// dia e um cabeçalho próprio (HORÁRIO, LOCAL, DEMANDA, ...). Descrição completa em ../LAYOUTS.md.
import {
  endDateOf,
  groupWeeks,
  inferYear,
  isBlank,
  labelDate,
  weekdayMismatch,
  looksCancelled,
  norm,
  normalizeEnd,
  oddMergeRows,
  parseDayTitle,
  parseTimeCell,
  type DayLabel,
} from '../cells.ts';
import type { CellValue, LayoutParser, ParsedEvent } from '../types.ts';
import { cellAt, isHeaderRow, joinNotes, readAssignments, readColumns, rowSummary, type Columns } from './common.ts';

// Cabeçalho de uma seção sem datas ("NOVAS DEMANDAS", "ATIVIDADES"): tem DEMANDA e não tem HORÁRIO.
function isUndatedHeader(row: CellValue[]): boolean {
  const cells = row.map(norm);
  return cells.includes('DEMANDA') && !cells.includes('HORARIO');
}

function sheetWidth(rows: CellValue[][]): number {
  const header = rows.find(isHeaderRow);
  return header ? readColumns(header).width : Math.max(0, ...rows.map((r) => r.length));
}

export const oficial2022Blocos: LayoutParser = {
  id: 'oficial-2022-blocos',

  detect(sheet) {
    const top = sheet.rows.slice(0, 6);
    return top.some((r) => parseDayTitle(r[0] ?? null) !== null) && sheet.rows.some(isHeaderRow);
  },

  parse(sheet, ctx) {
    const odd = oddMergeRows(sheet.merges, sheetWidth(sheet.rows));
    const labels: DayLabel[] = [];
    for (const r of sheet.rows) {
      const d = parseDayTitle(r[0] ?? null);
      if (d && !('invalid' in d)) labels.push(d);
    }
    const year = inferYear(labels, sheet.name, ctx.anchor, ctx.now);
    const firstMonth = labels[0]?.month ?? 1;

    const events: ParsedEvent[] = [];
    let day: DayLabel | { invalid: string } | null = null;
    let cols: Columns | null = null;
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const rowNumber = r + 1;
      if (isBlank(row)) continue;
      const title = parseDayTitle(row[0] ?? null);
      if (title && row.slice(1).every((c) => c === null || String(c).trim() === '')) {
        day = title;
        cols = null;
        continue;
      }
      if (isHeaderRow(row)) {
        cols = readColumns(row);
        continue;
      }
      if (isUndatedHeader(row)) {
        day = null;
        cols = null;
        continue;
      }
      if (odd.has(r)) {
        ctx.skip({ row: rowNumber, reason: 'celula_mesclada', detail: rowSummary(row) });
        continue;
      }
      if (!cols || !day) {
        // Observação do dia (folga, férias) antes do cabeçalho, ou linha de seção sem data.
        ctx.skip({ row: rowNumber, reason: cols || day ? 'observacao' : 'sem_data', detail: rowSummary(row) });
        continue;
      }
      if ('invalid' in day) {
        ctx.skip({ row: rowNumber, reason: 'data_invalida', detail: `Data ${day.invalid}: ${rowSummary(row)}` });
        continue;
      }
      const time = parseTimeCell(row[cols.time] ?? null);
      const demand = cellAt(row, cols.title);
      if (time && 'invalid' in time) {
        ctx.skip({ row: rowNumber, reason: demand ? 'horario_invalido' : 'observacao', detail: rowSummary(row) });
        continue;
      }
      if (!demand) {
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
        title: demand,
        location: cellAt(row, cols.location) || null,
        notes: joinNotes(notes, cellAt(row, cols.links)),
        typeLabel: null,
        cancelled: looksCancelled(demand, notes),
        externalId: null,
        assignments: readAssignments(row, cols, rowNumber, ctx),
        source: { sheet: sheet.name, row: rowNumber },
      });
    }
    return groupWeeks(events, 'oficial-2022-blocos', sheet.name);
  },
};
