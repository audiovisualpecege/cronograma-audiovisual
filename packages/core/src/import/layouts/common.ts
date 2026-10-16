// Partes comuns dos layouts do cronograma oficial (tabela com DIA e blocos por dia).
import { norm, splitNames, text } from '../cells.ts';
import type { CellValue, ParseContext, ParsedAssignment } from '../types.ts';

// Colunas que não são função. O resto do cabeçalho é função (EQUIPE/OPERADOR, MEDIADOR, ...).
const NOT_ROLE = new Set([
  '',
  ',',
  'DIA',
  'DATA',
  'HORARIO',
  'LOCAL',
  'DEMANDA',
  'OBSERVACOES',
  'OBSERVACAO',
  'LINKS',
  'LINK',
  'SETOR',
]);

// Nome da função como a revisão mostra; o administrador liga cada uma a uma função do cadastro.
const ROLE_LABELS: Record<string, string> = {
  'EQUIPE/OPERADOR': 'Operador',
  OPERADOR: 'Operador',
  EQUIPE: 'Operador',
  MEDIADOR: 'Mediador',
  'MEDIADOR/RELATORIO': 'Mediador',
  ASSISTENTE: 'Assistente',
  SUPORTE: 'Suporte',
  'RESPONSAVEL(IS)': 'Responsável',
  'RESPONSAVEL (IS)': 'Responsável',
  RESPONSAVEL: 'Responsável',
  RESPONSAVEIS: 'Responsável',
  PLANEJAMENTO: 'Planejamento',
};

export interface Columns {
  time: number;
  title: number;
  location: number | null;
  notes: number | null;
  links: number | null;
  roles: { col: number; label: string }[];
  width: number;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/])\p{L}/gu, (m) => m.toUpperCase());
}

export function isHeaderRow(row: CellValue[] | undefined): boolean {
  if (!row) return false;
  const cells = row.map(norm);
  return cells.includes('HORARIO') && cells.includes('DEMANDA');
}

export function readColumns(header: CellValue[]): Columns {
  const cells = header.map(norm);
  const idx = (...names: string[]) => {
    const i = cells.findIndex((c) => names.includes(c));
    return i < 0 ? null : i;
  };
  const roles: { col: number; label: string }[] = [];
  cells.forEach((c, col) => {
    if (NOT_ROLE.has(c)) return;
    // Texto solto na linha do cabeçalho (uma observação longa) não é função.
    if (!ROLE_LABELS[c] && (c.split(' ').length > 3 || c.length > 25 || /\d/.test(c))) return;
    roles.push({ col, label: ROLE_LABELS[c] ?? titleCase(text(header[col])) });
  });
  const width = cells.reduce((w, c, i) => (c ? i + 1 : w), 0);
  return {
    time: idx('HORARIO') as number,
    title: idx('DEMANDA') as number,
    location: idx('LOCAL'),
    notes: idx('OBSERVACOES', 'OBSERVACAO'),
    links: idx('LINKS', 'LINK'),
    roles,
    width,
  };
}

export function readAssignments(row: CellValue[], cols: Columns, rowNumber: number, ctx: ParseContext): ParsedAssignment[] {
  const out: ParsedAssignment[] = [];
  for (const { col, label } of cols.roles) {
    const { names, rejected } = splitNames(row[col]);
    for (const rawName of names) out.push({ role: label, rawName });
    for (const r of rejected) ctx.skip({ row: rowNumber, reason: 'nome_nao_reconhecido', detail: `${label}: ${r}` });
  }
  return out;
}

export function cellAt(row: CellValue[], col: number | null): string {
  return col === null ? '' : text(row[col]);
}

export function joinNotes(...parts: string[]): string | null {
  const s = parts.filter(Boolean).join('\n');
  return s || null;
}

/** Resumo curto de uma linha para o motivo de "não importado". */
export function rowSummary(row: CellValue[]): string {
  const s = row.map(text).filter(Boolean).join(' | ').replace(/\s+/g, ' ');
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}
