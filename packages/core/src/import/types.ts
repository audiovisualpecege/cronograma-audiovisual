// Tipos da leitura das planilhas de cronograma (TechSpec, Data Models, parágrafo Planilhas).

export type LayoutId = 'oficial-2026' | 'oficial-2022-blocos' | 'claude-escala';

export type SkipReason =
  | 'celula_mesclada'
  | 'data_invalida'
  | 'horario_invalido'
  | 'sem_data'
  | 'observacao'
  | 'nome_nao_reconhecido'
  | 'layout_desconhecido'
  | 'aba_vazia'
  | 'aba_resumo'
  | 'aba_cadastro';

export interface SkippedItem {
  sheet: string;
  row: number | null; // linha da planilha, começando em 1; nulo para a aba inteira
  reason: SkipReason;
  detail: string;
}

export interface ParsedAssignment {
  role: string | null; // rótulo da função como a planilha chama; nulo quando ela não diz
  rawName: string;
}

export interface ParsedEvent {
  date: string; // 'YYYY-MM-DD' em Brasília
  endDate: string; // igual a date, ou o dia seguinte quando atravessa a meia-noite
  start: string | null; // 'HH:MM'
  end: string | null;
  allDay: boolean;
  title: string;
  location: string | null;
  notes: string | null;
  typeLabel: string | null; // tipo escrito na planilha, quando há
  cancelled: boolean;
  externalId: string | null; // id do evento da agenda, quando a planilha guarda
  assignments: ParsedAssignment[];
  source: { sheet: string; row: number };
}

export interface ParsedWeek {
  weekStart: string;
  layout: LayoutId;
  sheets: string[];
  events: ParsedEvent[];
}

/** Valor de célula como o SheetJS entrega: texto, número (datas e horas são números de série) ou vazio. */
export type CellValue = string | number | boolean | null;

export interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/** Aba já lida, sem depender do SheetJS: linhas de valores (base 0) e mesclagens. */
export interface SheetGrid {
  name: string;
  rows: CellValue[][];
  merges: MergeRange[];
}

export interface ParseContext {
  /** Maior data já lida no arquivo, para deduzir o ano das abas que só têm dia e mês. */
  anchor: string | null;
  now: Date;
  skip(item: Omit<SkippedItem, 'sheet'>): void;
}

export interface LayoutParser {
  id: LayoutId;
  detect(sheet: SheetGrid): boolean;
  parse(sheet: SheetGrid, ctx: ParseContext): ParsedWeek[];
}
