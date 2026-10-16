// Layout "claude-escala": aba técnica "Escala" da planilha montada com o Claude, uma linha por
// evento da agenda, com datas em número de série e a equipe numa lista. Descrição em ../LAYOUTS.md.
import { addDays } from '../../time.ts';
import { fromSerial, groupWeeks, isBlank, looksCancelled, norm, splitNames, text } from '../cells.ts';
import type { CellValue, LayoutParser, ParsedEvent } from '../types.ts';
import { rowSummary } from './common.ts';

const REQUIRED = ['ID EVENTO', 'INICIO', 'FIM', 'NOME DA DEMANDA'];

function headerIndex(rows: CellValue[][]): number {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const cells = (rows[i] ?? []).map(norm);
    if (REQUIRED.every((h) => cells.includes(h))) return i;
  }
  return -1;
}

const NO_TYPE = new Set(['', 'NAO IDENTIFICADO', 'A DEFINIR']);

export const claudeEscala: LayoutParser = {
  id: 'claude-escala',

  detect(sheet) {
    return headerIndex(sheet.rows) >= 0;
  },

  parse(sheet, ctx) {
    const h = headerIndex(sheet.rows);
    const cells = (sheet.rows[h] ?? []).map(norm);
    const col = (name: string) => cells.indexOf(name);
    const c = {
      id: col('ID EVENTO'),
      start: col('INICIO'),
      end: col('FIM'),
      location: col('LOCAL'),
      title: col('NOME DA DEMANDA'),
      notes: col('OBSERVACAO'),
      link: col('LINK'),
      type: col('TIPO'),
      status: col('STATUS'),
      team: col('EQUIPE ALOCADA'),
    };
    const at = (row: CellValue[], i: number) => (i < 0 ? '' : text(row[i]));

    const events: ParsedEvent[] = [];
    for (let r = h + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const rowNumber = r + 1;
      if (isBlank(row)) continue;
      const startRaw = row[c.start];
      const endRaw = row[c.end];
      if (typeof startRaw !== 'number' || typeof endRaw !== 'number' || endRaw < startRaw) {
        ctx.skip({ row: rowNumber, reason: 'data_invalida', detail: rowSummary(row) });
        continue;
      }
      const title = at(row, c.title);
      if (!title) {
        ctx.skip({ row: rowNumber, reason: 'observacao', detail: rowSummary(row) });
        continue;
      }
      const s = fromSerial(startRaw);
      const e = fromSerial(endRaw);
      const allDay = s.time === '00:00' && e.time === '00:00' && endRaw > startRaw;
      const notes = at(row, c.notes);
      const typeLabel = at(row, c.type);
      const { names } = splitNames(row[c.team] ?? null);
      events.push({
        date: s.date,
        endDate: allDay ? addDays(e.date, -1) : e.date,
        start: allDay ? null : s.time,
        end: allDay ? null : e.time,
        allDay,
        title,
        location: at(row, c.location) || null,
        notes: [notes, at(row, c.link)].filter(Boolean).join('\n') || null,
        typeLabel: NO_TYPE.has(norm(typeLabel)) ? null : typeLabel,
        cancelled: looksCancelled(at(row, c.status), title),
        externalId: at(row, c.id) || null,
        // A aba lista a equipe sem dizer a função de cada pessoa; a revisão liga as funções.
        assignments: names.map((rawName) => ({ role: null, rawName })),
        source: { sheet: sheet.name, row: rowNumber },
      });
    }
    return groupWeeks(events, 'claude-escala', sheet.name);
  },
};
