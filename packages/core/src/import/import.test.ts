import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { SEED } from '../cases/seed.ts';
import { inferYear, parseDayCell, parseTimeCell, splitNames } from './cells.ts';
import { planImport } from './plan.ts';
import { detectLayout, gridFromSheet, ImportFileError, LAYOUT_PARSERS, NO_WEEKS_MESSAGE, readWorkbook, type WorkbookRead } from './read.ts';
import type { ParsedWeek, SheetGrid, SkippedItem } from './types.ts';

const now = new Date(SEED.now);
const root = new URL('../../../../', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, root));
const expected = (name: string) => JSON.parse(fixture(`${name}.expected.json`).toString('utf8')) as WorkbookRead;

function gridsOf(bytes: Buffer): SheetGrid[] {
  const wb = XLSX.read(bytes, { type: 'buffer' });
  return wb.SheetNames.map((n) => gridFromSheet(n, wb.Sheets[n] as XLSX.WorkSheet));
}

function workbook(sheets: [string, (string | number | null)[][], XLSX.Range[]?][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows, merges] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (merges) ws['!merges'] = merges;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

const HEADER = ['DIA', 'HORÁRIO', 'LOCAL', 'DEMANDA', 'OBSERVAÇÕES', 'LINKS', 'EQUIPE/OPERADOR', 'MEDIADOR', 'ASSISTENTE', 'SUPORTE'];
const skippedOf = (r: WorkbookRead, reason: SkippedItem['reason']) => r.skipped.filter((s) => s.reason === reason);

describe('leitura das planilhas', () => {
  it.each([
    ['UT-062', 'oficial-2026.xlsx', '05 - 11 de OUTUBRO-26', 'oficial-2026'],
    ['layout em blocos de 2022', 'blocos-2022.xlsx', '22 a 26 de agosto', 'oficial-2022-blocos'],
    ['aba técnica da planilha do Claude', 'claude-escala.xlsx', 'Escala', 'claude-escala'],
    ['aba de legenda', 'oficial-2026.xlsx', 'Legenda', null],
  ])('%s detectLayout na aba "%s" de %s', (_id, file, sheet, layout) => {
    const grid = gridsOf(fixture(file)).find((g) => g.name === sheet) as SheetGrid;
    expect(detectLayout(grid)).toBe(layout);
  });

  it('UT-063 parse da aba oficial devolve as semanas, eventos, funções e nomes do expected.json', () => {
    const grid = gridsOf(fixture('oficial-2026.xlsx')).find((g) => g.name === '05 - 11 de OUTUBRO-26') as SheetGrid;
    const parser = LAYOUT_PARSERS.find((p) => p.id === 'oficial-2026');
    const weeks = parser?.parse(grid, { anchor: null, now, skip: () => {} });
    expect(weeks).toEqual(expected('oficial-2026').weeks);
    const [week] = weeks as ParsedWeek[];
    expect(week?.weekStart).toBe('2026-10-05');
    expect(week?.events).toHaveLength(10);
    expect(new Set(week?.events.flatMap((e) => e.assignments.map((a) => a.role)))).toEqual(new Set(['Operador', 'Mediador', 'Assistente']));
  });

  it.each(['oficial-2026', 'blocos-2022', 'claude-escala'])('fixture %s é lida inteira como no expected.json', (name) => {
    expect(readWorkbook(fixture(`${name}.xlsx`), { now })).toEqual(expected(name));
  });

  it('UT-064 célula mesclada fora do padrão vai para skipped com celula_mesclada', () => {
    const r = readWorkbook(fixture('oficial-2026.xlsx'), { now });
    expect(skippedOf(r, 'celula_mesclada')).toEqual([
      expect.objectContaining({ sheet: '05 - 11 de OUTUBRO-26', row: 18, reason: 'celula_mesclada' }),
    ]);
    expect(r.weeks.flatMap((w) => w.events).some((e) => e.title.includes('mescladas'))).toBe(false);
  });

  it('UT-064 duas linhas de um evento mescladas também saem', () => {
    const r = readWorkbook(
      workbook([
        [
          '05 - 11 de OUTUBRO-26',
          [HEADER, ['05/10\nSEGUNDA', '09:00 - 10:00', 'Sala 1', 'Evento bom', null, null, 'Ana'], ['05/10\nSEGUNDA', '10:00 - 12:00', 'Sala 2', 'Evento em duas linhas', null, null, 'Bia'], ['05/10\nSEGUNDA', null, null, null, null, null, 'Caio']],
          [{ s: { r: 2, c: 3 }, e: { r: 3, c: 3 } }],
        ],
      ]),
      { now },
    );
    expect(skippedOf(r, 'celula_mesclada').map((s) => s.row)).toEqual([3, 4]);
    expect(r.weeks[0]?.events.map((e) => e.title)).toEqual(['Evento bom']);
  });

  it('UT-065 data 31/02 vai para skipped com data_invalida', () => {
    const r = readWorkbook(fixture('oficial-2026.xlsx'), { now });
    expect(skippedOf(r, 'data_invalida')).toEqual([
      expect.objectContaining({ row: 17, reason: 'data_invalida', detail: expect.stringContaining('31/02') }),
    ]);
  });

  it('dia da semana que não bate com a data também é data_invalida', () => {
    const r = readWorkbook(
      workbook([['set', [HEADER, ['04/09\nSEGUNDA', '09:00 - 10:00', null, 'Certo'], ['05/08\nTERÇA', '09:00 - 10:00', null, 'Mês trocado']]]]),
      { now: new Date('2023-09-10T12:00:00-03:00') },
    );
    expect(r.weeks.map((w) => w.weekStart)).toEqual(['2023-09-04']);
    expect(skippedOf(r, 'data_invalida').map((s) => s.row)).toEqual([3]);
  });

  it('UT-066 arquivo sem semana reconhecível devolve 0 semanas e "Nenhuma semana encontrada"', () => {
    const r = readWorkbook(workbook([['Legenda', [['Texto em vermelho', 'Não confirmado']]], ['Vazia', []]]), { now });
    expect(r.weeks).toEqual([]);
    expect(r.message).toBe(NO_WEEKS_MESSAGE);
    expect(r.message).toBe('Nenhuma semana encontrada');
  });

  it('UT-067 aba de layout desconhecido vai para skipped e as outras abas são lidas', () => {
    const r = readWorkbook(fixture('oficial-2026.xlsx'), { now });
    expect(r.skipped).toContainEqual({ sheet: 'Legenda', row: null, reason: 'layout_desconhecido', detail: expect.any(String) });
    expect(r.weeks).toHaveLength(1);
    expect(r.sheets.map((s) => [s.name, s.layout])).toEqual([
      ['05 - 11 de OUTUBRO-26', 'oficial-2026'],
      ['Legenda', null],
      ['Planilha1', null],
    ]);
  });

  it('arquivo que não é .xlsx é recusado com mensagem clara', () => {
    expect(() => readWorkbook(new TextEncoder().encode('nome;data\nAna;01/02'), { now })).toThrow(ImportFileError);
    expect(() => readWorkbook(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), { now })).toThrow(/não abriu|não é/);
  });

  it('a mesma semana em duas abas vira uma só, sem repetir eventos', () => {
    const rows = [HEADER, ['05/10\nSEGUNDA', '09:00 - 10:00', 'Sala 1', 'Evento', null, null, 'Ana']];
    const r = readWorkbook(workbook([['05 a 11 de outubro', rows], ['05 a 11 de outubro (2)', [...rows, ['06/10\nTERÇA', '09:00 - 10:00', 'Sala 1', 'Outro', null, null, 'Bia']]]]), { now });
    expect(r.weeks).toHaveLength(1);
    expect(r.weeks[0]?.sheets).toEqual(['05 a 11 de outubro', '05 a 11 de outubro (2)']);
    expect(r.weeks[0]?.events.map((e) => e.title)).toEqual(['Evento', 'Outro']);
  });
});

describe('células', () => {
  it.each([
    ['05/10\nSEGUNDA', { day: 5, month: 10, year: null, weekday: 1 }],
    ['✨25/03✨\nTERÇA', { day: 25, month: 3, year: null, weekday: 2 }],
    ['🎬 01/04✨\nQUARTA', { day: 1, month: 4, year: null, weekday: 3 }],
    ['10/08\nQua', { day: 10, month: 8, year: null, weekday: 3 }],
    ['31/02\nTERÇA', { invalid: '31/02' }],
    ['Férias Fulano até 13/10', null],
    ['Folga Ana', null],
  ])('parseDayCell(%j)', (cell, out) => {
    expect(parseDayCell(cell)).toEqual(out);
  });

  it.each([
    ['09:00 - 12:30', { start: '09:00', end: '12:30' }],
    ['19:00 -23:00', { start: '19:00', end: '23:00' }],
    ['14:00  18:00', { start: '14:00', end: '18:00' }],
    ['8:30 - 12:00', { start: '08:30', end: '12:00' }],
    ['14h às 15h', { start: '14:00', end: '15:00' }],
    ['16:30 - 17h:30', { start: '16:30', end: '17:30' }],
    [0.5833333333333334, { start: '14:00', end: null }],
    ['18:00 - 19:300', { invalid: '18:00 - 19:300' }],
    ['Folga Fulano', { invalid: 'Folga Fulano' }],
    ['', null],
  ] as const)('parseTimeCell(%j)', (cell, out) => {
    expect(parseTimeCell(cell)).toEqual(out);
  });

  it.each([
    ['Carla + Diego + Elisa', ['Carla', 'Diego', 'Elisa'], []],
    ['Bruno (presencial) + Ana (virtual)', ['Bruno', 'Ana'], []],
    ['Fábio e Gabi', ['Fábio', 'Gabi'], []],
    ['Hugo/Iara', ['Hugo', 'Iara'], []],
    ['Todos', [], []],
    ['Equipe Marketing', [], []],
    ['Enviar link para o professor na hora', [], ['Enviar link para o professor na hora']],
  ])('splitNames(%j)', (cell, names, rejected) => {
    expect(splitNames(cell)).toEqual({ names, rejected });
  });

  it.each([
    ['primeira aba de 2022', [{ day: 22, month: 8, year: null, weekday: 1 }], '22 a 26 de agosto', null, 2022],
    ['aba de 2026 pelo dia da semana e pelo sufixo', [{ day: 5, month: 10, year: null, weekday: 1 }], '05 - 11 de OUTUBRO-26', '2026-09-30', 2026],
    ['aba fora de ordem perto da âncora', [{ day: 15, month: 8, year: null, weekday: 1 }], '15 a 19 de agosto', '2024-08-10', 2022],
  ])('inferYear: %s', (_name, labels, sheet, anchor, year) => {
    expect(inferYear(labels, sheet, anchor, now)).toBe(year);
  });
});

describe('plano de importação', () => {
  const week = (weekStart: string): ParsedWeek => ({
    weekStart,
    layout: 'oficial-2026',
    sheets: [weekStart],
    events: [
      {
        date: weekStart,
        endDate: weekStart,
        start: '09:00',
        end: '10:00',
        allDay: false,
        title: 'Evento',
        location: null,
        notes: null,
        typeLabel: null,
        cancelled: false,
        externalId: null,
        assignments: [{ role: 'Operador', rawName: 'Ana' }],
        source: { sheet: weekStart, row: 2 },
      },
    ],
  });
  const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', SEED.weekB, '2026-11-02'].map(week);

  it('UT-068 com a semana B montada na plataforma, B e as seguintes saem do plano', () => {
    const plan = planImport({ weeks, platformWeeks: [SEED.weekB, '2026-11-09'], importedWeeks: [] });
    expect(plan.cutoff).toBe(SEED.weekB);
    expect(plan.weeks.map((w) => w.weekStart)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(plan.excluded).toEqual([
      { weekStart: SEED.weekB, reason: 'platform_week' },
      { weekStart: '2026-11-02', reason: 'platform_week' },
    ]);
    expect(plan.toImport.map((w) => w.weekStart)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    expect(plan.ready).toBe(true);
  });

  it('UT-069 semana já importada fica already_imported e exige substituir ou ignorar', () => {
    const base = { weeks: weeks.slice(0, 2), platformWeeks: [], importedWeeks: ['2026-10-12'] };
    const pending = planImport(base);
    expect(pending.weeks).toEqual([
      { weekStart: '2026-10-05', status: 'new', choice: null, events: 1, assignments: 1 },
      { weekStart: '2026-10-12', status: 'already_imported', choice: null, events: 1, assignments: 1 },
    ]);
    expect(pending.needsChoice).toEqual(['2026-10-12']);
    expect(pending.ready).toBe(false);

    const replace = planImport({ ...base, choices: { '2026-10-12': 'replace' } });
    expect(replace.ready).toBe(true);
    expect(replace.replaceWeeks).toEqual(['2026-10-12']);
    expect(replace.toImport.map((w) => w.weekStart)).toEqual(['2026-10-05', '2026-10-12']);

    const ignore = planImport({ ...base, choices: { '2026-10-12': 'ignore' } });
    expect(ignore.toImport.map((w) => w.weekStart)).toEqual(['2026-10-05']);
    expect(ignore.replaceWeeks).toEqual([]);
  });
});

// Os anexos da ideia ficam no repositório: todos os layouts deles são lidos sem erro.
const anexos = fileURLToPath(new URL('.compozy/tasks/026-plataforma-cronograma-audiovisual/anexos/', root));
const oficial = `${anexos}1-Cronograma Semanal OFICIAL 2026.xlsx`;
const claude = `${anexos}2-Cronograma Claude.xlsx`;

describe.runIf(existsSync(oficial) && existsSync(claude))('anexos da ideia', () => {
  it('o cronograma oficial é lido inteiro: toda aba tem layout ou motivo conhecido', () => {
    const r = readWorkbook(readFileSync(oficial), { now });
    expect(r.sheets).toHaveLength(220);
    expect(new Set(r.sheets.map((s) => s.layout))).toEqual(new Set(['oficial-2026', 'oficial-2022-blocos', null]));
    expect(r.sheets.filter((s) => s.layout === null).map((s) => s.name).sort()).toEqual(
      ['Edição.', 'Legenda', 'Planilha1', 'Planilha2', 'Planilha3', 'Planilha4'].sort(),
    );
    expect(r.weeks.length).toBeGreaterThanOrEqual(200);
    expect(r.weeks[0]?.weekStart).toBe('2022-08-15');
    expect(r.weeks.at(-1)?.weekStart).toBe('2026-10-19');
    for (const w of r.weeks) expect(w.weekStart >= '2022-08-15' && w.weekStart <= '2026-10-19').toBe(true);
  }, 30_000);

  it('a planilha do Claude é lida pela aba Escala e as outras ficam como resumo ou cadastro', () => {
    const r = readWorkbook(readFileSync(claude), { now });
    expect(r.sheets.map((s) => [s.name, s.layout])).toEqual([
      ['Revisar', null],
      ['Painel', null],
      ['Grade Semanal', null],
      ['Escala', 'claude-escala'],
      ['TiposDemanda', null],
      ['Profissionais', null],
    ]);
    expect(r.skipped.filter((s) => s.row === null).map((s) => s.reason)).toEqual(['aba_resumo', 'aba_resumo', 'aba_resumo', 'aba_cadastro', 'aba_cadastro']);
    expect(r.weeks.map((w) => w.weekStart)).toEqual(['2026-08-03', '2026-08-10']);
    expect(r.weeks.reduce((n, w) => n + w.events.length, 0)).toBe(137);
  });
});
