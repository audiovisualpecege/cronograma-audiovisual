// Leitura de um arquivo .xlsx de cronograma: SheetJS abre o arquivo, cada aba vai para o
// LayoutParser que a reconhece e as semanas repetidas entre abas são juntadas.
// É a única parte do core que lê bytes de arquivo; quem chama entrega os bytes (Web Worker no app).
import * as XLSX from 'xlsx';
import { norm, text } from './cells.ts';
import { claudeEscala } from './layouts/claudeEscala.ts';
import { oficial2022Blocos } from './layouts/oficial2022Blocos.ts';
import { oficial2026 } from './layouts/oficial2026.ts';
import type { CellValue, LayoutId, LayoutParser, MergeRange, ParsedEvent, ParsedWeek, SheetGrid, SkippedItem } from './types.ts';

/** Ordem importa: o primeiro que reconhece a aba fica com ela. */
export const LAYOUT_PARSERS: LayoutParser[] = [claudeEscala, oficial2022Blocos, oficial2026];

export const NO_WEEKS_MESSAGE = 'Nenhuma semana encontrada';

export class ImportFileError extends Error {
  constructor(
    public code: 'arquivo_invalido' | 'arquivo_protegido',
    message: string,
  ) {
    super(message);
  }
}

export interface SheetReport {
  name: string;
  layout: LayoutId | null;
  weeks: number;
  events: number;
}

export interface WorkbookRead {
  weeks: ParsedWeek[];
  skipped: SkippedItem[];
  sheets: SheetReport[];
  message: string | null; // "Nenhuma semana encontrada" quando nada foi reconhecido
}

export function detectLayout(sheet: SheetGrid): LayoutId | null {
  return LAYOUT_PARSERS.find((p) => p.detect(sheet))?.id ?? null;
}

// Abas conhecidas que não trazem semanas: resumos e cadastros da planilha do Claude.
function knownNonWeek(sheet: SheetGrid): Pick<SkippedItem, 'reason' | 'detail'> | null {
  const first = norm(sheet.rows.flat().find((c) => text(c) !== '') ?? '');
  if (/^(REVISAR A ESCALA|ESCALA DA SEMANA|GRADE SEMANAL)/.test(first)) {
    return { reason: 'aba_resumo', detail: 'Resumo da aba Escala; os eventos são lidos de lá' };
  }
  const header = sheet.rows.slice(0, 5).map((r) => r.map(norm));
  if (header.some((r) => (r.includes('TIPO') && r.includes('FUNCAO 1')) || (r.includes('NOME') && r.includes('ATIVO')))) {
    return { reason: 'aba_cadastro', detail: 'Cadastro de tipos ou de pessoas, não é uma semana' };
  }
  return null;
}

const eventKey = (e: ParsedEvent) =>
  [e.date, e.start, e.end, norm(e.title), norm(e.location), ...e.assignments.map((a) => norm(a.rawName))].join('|');

/** Lê abas já convertidas em grade. Puro: é o que os testes e o Web Worker chamam depois do SheetJS. */
export function parseSheets(grids: SheetGrid[], opts: { now?: Date } = {}): WorkbookRead {
  const now = opts.now ?? new Date();
  const skipped: SkippedItem[] = [];
  const sheets: SheetReport[] = [];
  const weeks = new Map<string, ParsedWeek>();
  const seen = new Map<string, Map<string, string>>(); // semana -> evento -> aba de onde veio
  let anchor: string | null = null;

  for (const grid of grids) {
    if (grid.rows.every((r) => r.every((c) => text(c) === ''))) {
      skipped.push({ sheet: grid.name, row: null, reason: 'aba_vazia', detail: 'Aba sem conteúdo' });
      sheets.push({ name: grid.name, layout: null, weeks: 0, events: 0 });
      continue;
    }
    const known = knownNonWeek(grid);
    const parser = known ? undefined : LAYOUT_PARSERS.find((p) => p.detect(grid));
    if (!parser) {
      skipped.push({
        sheet: grid.name,
        row: null,
        ...(known ?? { reason: 'layout_desconhecido', detail: 'A plataforma não reconhece o formato desta aba' }),
      });
      sheets.push({ name: grid.name, layout: null, weeks: 0, events: 0 });
      continue;
    }
    const parsed = parser.parse(grid, {
      anchor,
      now,
      skip: (item) => skipped.push({ sheet: grid.name, ...item }),
    });
    let events = 0;
    for (const w of parsed) {
      events += w.events.length;
      let target = weeks.get(w.weekStart);
      let keys = seen.get(w.weekStart);
      if (!target || !keys) {
        target = { ...w, sheets: [], events: [] };
        keys = new Map();
        weeks.set(w.weekStart, target);
        seen.set(w.weekStart, keys);
      }
      if (!target.sheets.includes(grid.name)) target.sheets.push(grid.name);
      for (const e of w.events) {
        const k = eventKey(e);
        const from = keys.get(k);
        if (from !== undefined && from !== grid.name) continue; // a mesma semana copiada noutra aba
        keys.set(k, grid.name);
        target.events.push(e);
      }
      const last = w.events.reduce((m, e) => (e.date > m ? e.date : m), w.weekStart);
      if (!anchor || last > anchor) anchor = last;
    }
    sheets.push({ name: grid.name, layout: parser.id, weeks: parsed.length, events });
  }

  const list = [...weeks.values()]
    .filter((w) => w.events.length > 0)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  for (const w of list) {
    w.events.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? '').localeCompare(b.start ?? ''));
  }
  return { weeks: list, skipped, sheets, message: list.length === 0 ? NO_WEEKS_MESSAGE : null };
}

/** Grade de uma aba do SheetJS com posições absolutas (linha e coluna 0 = A1). */
export function gridFromSheet(name: string, ws: XLSX.WorkSheet): SheetGrid {
  const ref = ws['!ref'];
  const rows: CellValue[][] = [];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let r = 0; r <= range.e.r; r++) {
      const row: CellValue[] = [];
      for (let c = 0; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
        const v = cell && cell.t !== 'e' && cell.t !== 'z' ? cell.v : null;
        row.push(v instanceof Date ? v.toISOString() : ((v ?? null) as CellValue));
      }
      rows.push(row);
    }
  }
  const merges: MergeRange[] = (ws['!merges'] ?? []).map((m) => ({ s: { ...m.s }, e: { ...m.e } }));
  return { name, rows, merges };
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export interface ReadOptions {
  now?: Date;
  /** Chamado antes de cada aba, para mostrar o progresso (US-007 EC-5). */
  onSheet?: (sheet: { name: string; index: number; total: number }) => void;
}

/** Abre um .xlsx e lê todas as abas. Arquivo que não é .xlsx, corrompido ou com senha é recusado. */
export function readWorkbook(data: ArrayBuffer | Uint8Array, opts: ReadOptions = {}): WorkbookRead {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false });
  } catch (err) {
    if (/password|encrypt/i.test(String((err as Error)?.message ?? err))) {
      throw new ImportFileError('arquivo_protegido', 'O arquivo está protegido por senha. Tire a senha no Excel e envie de novo.');
    }
    throw new ImportFileError('arquivo_invalido', 'O arquivo não abriu como planilha .xlsx. Confira se é o arquivo certo.');
  }
  if (!isZip(bytes)) {
    throw new ImportFileError('arquivo_invalido', 'O arquivo não é uma planilha .xlsx. Salve como .xlsx no Excel e envie de novo.');
  }
  const total = wb.SheetNames.length;
  const grids = wb.SheetNames.map((n, index) => {
    opts.onSheet?.({ name: n, index, total });
    return gridFromSheet(n, wb.Sheets[n] as XLSX.WorkSheet);
  });
  return parseSheets(grids, { now: opts.now });
}
