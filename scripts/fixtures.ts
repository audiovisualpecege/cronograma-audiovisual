// Gera as planilhas de exemplo de fixtures/ a partir da estrutura dos anexos da ideia #26, com nomes,
// títulos e observações trocados por inventados: nenhum dado pessoal real sai daqui.
// Cada planilha ganha o .expected.json com a leitura do core, revisado à mão antes de entrar no git.
// Uso: npm run fixtures
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../packages/core/src/index.ts';

const fixturesDir = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const FIXTURE_NOW = new Date('2026-10-21T12:00:00-03:00');

type Row = (string | number | boolean | null)[];
const merge = (r1: number, c1: number, r2: number, c2: number): XLSX.Range => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

function sheet(rows: Row[], merges: XLSX.Range[] = []): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  return ws;
}

// Layout oficial-2026, como a aba "05 - 11 de OUTUBRO-26" do cronograma oficial.
function oficial2026(): XLSX.WorkBook {
  const rows: Row[] = [
    ['DIA', 'HORÁRIO', 'LOCAL', 'DEMANDA', 'OBSERVAÇÕES', 'LINKS', 'EQUIPE/OPERADOR', 'MEDIADOR', 'ASSISTENTE', 'SUPORTE'],
    [],
    [],
    [],
    ['05/10\nSEGUNDA', '07:00 - 14:00', 'Sala 12', 'Evento de abertura', 'Preparar a sala 12 na sexta-feira', null, 'Bruno Exemplo'],
    ['05/10\nSEGUNDA', '08:00 - 17:00', 'Externa', 'ID 20260835: Gravação - Vídeos Institucionais', 'Considerar operador de drone', null, 'Carla Modelo + Diego Teste + Elisa Amostra'],
    ['05/10\nSEGUNDA', '13:00 - 17:00', 'Estúdio SP PRESENCIAL', 'GRAVAÇÃO: MBA em Gestão de Projetos\nDisciplina: Planejamento', 'COFFEE BREAK: Precisa de coffee break', null, 'Fábio Simulado', 'Gabi Ensaio'],
    ['05/10\nSEGUNDA', '14:00 - 17:00', 'Zoom Sala 8', 'GRAVAÇÃO: MBA em Cibersegurança', 'CANCELADA', null, 'Hugo Rascunho', 'Iara Protótipo'],
    ['05/10\nSEGUNDA', '19:00 -23:00', 'Estúdio Fogo + Zoom Fogo', 'MBA em Finanças e Controladoria', null, null, 'Ana Fictícia (presencial)', 'Bruno Exemplo', 'Carla Modelo + Diego Teste'],
    ['05/10\nSEGUNDA', '20:30 - 21:30', 'Zoom Sala 2', 'English@USP - Focus on Speaking', null, 'https://exemplo.test/aula', 'Todos'],
    [],
    ['Folga Elisa Amostra'],
    [],
    ['✨06/10✨\nTERÇA', 0.375, 'Zoom Sala 07', 'Curso de análise de dados', null, null, null, 'Gabi Ensaio'],
    ['06/10\nTERÇA', '22:00 - 02:00', 'Estúdio Ar', 'Transmissão de madrugada', null, null, 'Hugo Rascunho'],
    ['06/10\nTERÇA', '18:00 - 19:300', 'Estúdio Terra', 'Horário digitado errado', null, null, 'Iara Protótipo'],
    ['31/02\nTERÇA', '10:00 - 11:00', 'Sala 3', 'Linha com data errada', null, null, 'João Pedro Exemplo'],
    ['07/10\nQUARTA', '16:00 - 18:00', null, 'Linha com células mescladas no meio', null, null, 'Ana Fictícia'],
    ['07/10\nQUARTA', '08:00 - 12:00', 'Estúdio Ar', 'MONTAGEM DE CENÁRIO', 'Precisa de TP', null, 'Iara Protótipo / João Pedro Exemplo'],
    [],
    ['11/10\nDOMINGO', '09:00 - 13:00', 'Externa', 'Evento de domingo', null, null, 'Ana Fictícia e Bruno Exemplo'],
  ];
  const full = (r: number) => merge(r, 0, r, 9);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    sheet(rows, [full(2), full(3), full(10), full(11), full(12), merge(17, 1, 17, 2), full(19)]),
    '05 - 11 de OUTUBRO-26',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      [null, 'Demandas Audiovisual', null, null, 'Planejamento', 'Produção'],
      ['Texto em vermelho', 'Não confirmado'],
      [null, 'Férias/Folga'],
    ]),
    'Legenda',
  );
  XLSX.utils.book_append_sheet(wb, sheet([]), 'Planilha1');
  return wb;
}

// Layout oficial-2022-blocos, como a aba "22 a 26 de agosto" de 2022.
function blocos2022(): XLSX.WorkBook {
  const header = ['DATA', 'HORÁRIO', 'LOCAL', 'DEMANDA', 'OBSERVAÇÕES', 'RESPONSÁVEL(IS)'];
  const rows: Row[] = [
    ['SEGUNDA 22/08'],
    ['Férias Gabi Ensaio de 15 a 26/08'],
    header,
    [null, '08:00 - 12:00', 'Estúdio Água', 'Gravação Institucional', null, 'Carla Modelo + Diego Teste'],
    [44788, '14:00 - 15:00', 'Online', 'Reunião Estúdio', null, 'Todos'],
    [null, '16:00 - 17:00', 'Estúdio Água', 'Gravação de curso\nEstudo dirigido', 'Professor chega 15h30', 'Elisa Amostra + Fábio Simulado'],
    ['TERÇA 23/08'],
    header,
    [null, '19:00 - 23:00', 'ESTÚDIO: Terra + Zoom', 'MBA em Agronegócio', 'Traslado com motorista', 'Fábio Simulado (presencial) + Gabi Ensaio (virtual)'],
    [null, '13:00 - 17h30', 'Estúdio Fogo', 'Teste de transmissão', null, 'Hugo Rascunho'],
    ['ATIVIDADES'],
    ['DEMANDA', null, 'OBSERVAÇÕES', null, 'RESPONSÁVEL(IS)'],
    ['Criação de cenário', null, 'https://exemplo.test/cartao', null, 'Iara Protótipo'],
  ];
  const full = (r: number) => merge(r, 0, r, 5);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    sheet(rows, [full(0), full(1), full(6), merge(10, 1, 10, 5), merge(12, 0, 12, 1), merge(12, 2, 12, 3)]),
    '22 a 26 de agosto',
  );
  return wb;
}

// Layout claude-escala, como a planilha montada com o Claude (aba técnica e abas de resumo e cadastro).
function claude(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      ['REVISAR A ESCALA DA SEMANA'],
      ['Edite só as colunas azuis'],
      [],
      ['Dia', 'Horário', 'Demanda', 'Local', 'Tipo', 'Equipe', 'Situação', 'Travado', 'ID'],
      ['10/08\nSeg', '07:00 – 14:00', 'Evento de abertura', 'Sala 12', 'NAO IDENTIFICADO', null, 'Escolha o tipo ao lado', false, 'evt-0001'],
    ]),
    'Revisar',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      [null, 'Data início', 46244, null, 'Aba técnica'],
      [],
      ['ID Evento', 'Data', 'Início', 'Fim', 'Local', 'Nome da Demanda', 'Observação', 'Link', 'Tipo', 'Status', 'Equipe Alocada', 'Status Escala', 'Travado', 'Tipo Manual'],
      ['evt-0003@exemplo.test', 46239, 46239, 46251, null, 'Férias Carla Modelo', null, null, 'NAO IDENTIFICADO', 'Revisar Tipo', null, 'Revisar Tipo', false, true],
      ['evt-0001@exemplo.test', 46244.291666666664, 46244.291666666664, 46244.583333333336, 'Sala 12', 'Evento de abertura', 'Preparar a sala', null, 'NAO IDENTIFICADO', 'Revisar Tipo', null, 'Revisar Tipo', false, false],
      ['evt-0002@exemplo.test', 46244.583333333336, 46244.583333333336, 46244.666666666664, 'Zoom', 'GRAVAÇÃO: MBA em Data Science', 'Aula da turma 261', null, 'AULA MBA', 'Pendente Escala', 'Ana Fictícia, Bruno Exemplo', 'Completo', false, false],
      ['evt-0004@exemplo.test', 'sem data', null, null, 'Sala 3', 'Linha sem data', null, null, 'NAO IDENTIFICADO', 'Revisar Tipo', null, 'Revisar Tipo', false, false],
    ]),
    'Escala',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      [],
      [null, 'Nome', 'Ativo', 'Entrada', 'Saida', 'Cidade', 'Mediacao'],
      [null, 'Ana Fictícia', 'Sim', 0.5833333333333334, 0.9583333333333334, 'Piracicaba', 'x'],
    ]),
    'Profissionais',
  );
  return wb;
}

export const FIXTURES: { file: string; build: () => XLSX.WorkBook }[] = [
  { file: 'oficial-2026', build: oficial2026 },
  { file: 'blocos-2022', build: blocos2022 },
  { file: 'claude-escala', build: claude },
];

export function writeFixtures(dir = fixturesDir): void {
  for (const f of FIXTURES) {
    const wb = f.build();
    wb.Props = { CreatedDate: FIXTURE_NOW, ModifiedDate: FIXTURE_NOW };
    const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    writeFileSync(join(dir, `${f.file}.xlsx`), bytes);
    const expected = readWorkbook(bytes, { now: FIXTURE_NOW });
    writeFileSync(join(dir, `${f.file}.expected.json`), `${JSON.stringify(expected, null, 2)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) writeFixtures();
