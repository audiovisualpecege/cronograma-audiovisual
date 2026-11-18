import { describe, expect, it } from 'vitest';
import { SEED } from './cases/seed.ts';
import { classifyEvent, classifyTitle, descriptionLine, detectDuplicates, withoutRequestId, type DuplicateCandidate, type TitleIndex } from './classify.ts';
import { zonedTime } from './time.ts';

const types = SEED.serviceTypes.map((t) => ({ id: t.id, code: t.code, keywords: t.keywords }));

describe('classificação por palavra-chave e histórico', () => {
  it.each<[string, string, typeof types, TitleIndex, object]>([
    ['UT-044 palavra-chave "aula"', 'Gravação aula Matemática', types, [], { type: 'T1', typeId: 't1', certainty: 'alta', source: 'keyword' }],
    [
      'UT-045 sem palavra-chave, Jaccard 0,67 com o histórico de T2',
      'Cobertura Agrishow',
      types,
      [{ title: 'Cobertura Agrishow 2025', serviceTypeId: 't2' }],
      { type: 'T2', typeId: 't2', certainty: 'media', source: 'history' },
    ],
    [
      'UT-046 Jaccard máximo 0,57 fica a definir',
      'Cobertura feira agro norte sul',
      types,
      [{ title: 'Cobertura feira agro norte leste oeste', serviceTypeId: 't2' }],
      { type: null, typeId: null, certainty: 'baixa' },
    ],
    [
      'UT-047 "GRAVAÇÃO AULA" casa com a palavra-chave "gravacao aula"',
      'GRAVAÇÃO AULA',
      [{ id: 't9', code: 'T9', keywords: ['gravacao aula'] }],
      [],
      { type: 'T9', certainty: 'alta', source: 'keyword' },
    ],
  ])('%s', (_name, title, list, history, expected) => {
    expect(classifyTitle(title, list, history)).toMatchObject(expected);
  });

  it('UT-045 e UT-046 a nota de semelhança vem junto', () => {
    expect(classifyTitle('Cobertura Agrishow', types, [{ title: 'Cobertura Agrishow 2025', serviceTypeId: 't2' }]).score).toBeCloseTo(0.667, 3);
    expect(
      classifyTitle('Cobertura feira agro norte sul', types, [{ title: 'Cobertura feira agro norte leste oeste', serviceTypeId: 't2' }]).score,
    ).toBeCloseTo(0.571, 3);
  });

  it('palavra-chave tem de ser palavra inteira e tipo arquivado não classifica', () => {
    expect(classifyTitle('Aulão de revisão', types, []).type).toBeNull();
    expect(classifyTitle('Gravação aula', [{ ...types[0]!, archived: true }], []).type).toBeNull();
  });
});

describe('começo do título e série', () => {
  const rules = [
    { id: 'mba', code: 'T1', keywords: ['^mba', '^poli'] },
    { id: 'interna', code: 'T2', keywords: ['^reuniao'] },
    { id: 'mediadores', code: 'T3', keywords: ['^reuniao mediadores'] },
  ];
  // A planilha antiga marcou o título igual como aula.
  const dirty: TitleIndex = [{ title: 'Reunião Mediadores POLI USP PRO', serviceTypeId: 'mba' }];

  it('"Reunião Mediadores POLI USP PRO" é reunião, mesmo com o histórico dizendo aula', () => {
    expect(classifyTitle('Reunião Mediadores POLI USP PRO', rules, dirty)).toMatchObject({ typeId: 'mediadores', certainty: 'alta', source: 'keyword' });
  });

  it('"Reunião" sozinha vai para a reunião geral; a palavra de começo não vale no meio do título', () => {
    expect(classifyTitle('Reunião com a coordenação Unesp', rules, [])).toMatchObject({ typeId: 'interna' });
    expect(classifyTitle('Aula MBA depois da reunião', rules, []).typeId).toBeNull();
    expect(classifyTitle('POLI USP: Indústria 4.0', rules, [])).toMatchObject({ typeId: 'mba' });
  });

  it('empate entre dois tipos com o mesmo começo fica para as outras regras', () => {
    const tie = [...rules, { id: 'outro', code: 'T4', keywords: ['^mba'] }];
    expect(classifyTitle('MBA Gestão', tie, []).typeId).toBeNull();
  });

  it('o tipo aprendido pela série vence o começo do título', () => {
    const series = new Map([['reuniao mediadores poli usp pro', 'mba']]);
    expect(classifyTitle('Reunião Mediadores POLI USP PRO', rules, [], series)).toMatchObject({ typeId: 'mba', certainty: 'alta', source: 'series' });
    expect(classifyTitle('Reunião Mediadores POLI USP PRO', rules, [], new Map([['reuniao mediadores poli usp pro', 'arquivado']]))).toMatchObject({ typeId: 'mediadores' });
  });
});

describe('número do pedido e "Não marcar nada"', () => {
  const rules = [
    { id: 'montagem', code: 'T1', keywords: ['^montagem de cenario'] },
    { id: 'gravacao', code: 'T2', keywords: ['^gravacao'] },
    { id: 'reserva', code: 'T3', keywords: ['nao marcar nada'] },
    { id: 'disp', code: 'T4', keywords: ['*disponibilizar'] },
  ];

  it('o "ID 2026xxxx" na frente sai antes das regras de começo', () => {
    expect(withoutRequestId('ID 20260911 Gravação: Cursos Solution 2026')).toBe('Gravação: Cursos Solution 2026');
    expect(withoutRequestId('ID 20260829 - MONTAGEM DE CENÁRIO: Reels')).toBe('MONTAGEM DE CENÁRIO: Reels');
    expect(withoutRequestId('Ideias de pauta')).toBe('Ideias de pauta');
    expect(classifyTitle('ID 20260911 Gravação: Cursos Solution 2026', rules, [])).toMatchObject({ typeId: 'gravacao', source: 'keyword' });
    expect(classifyTitle('ID 20260829 - MONTAGEM DE CENÁRIO: Reels', rules, [])).toMatchObject({ typeId: 'montagem' });
    expect(classifyTitle('ID 20260900 - *DISPONIBILIZAR: aula 3', rules, [])).toMatchObject({ typeId: 'disp' });
  });

  it('"NÃO MARCAR NADA" usa a primeira linha da descrição; sem tipo nela, vale o título', () => {
    const e = { title: 'NÃO MARCAR NADA', description: '<p>Montagem de cenário ELG</p><p>Sala 3</p>' };
    expect(descriptionLine(e.description)).toBe('Montagem de cenário ELG');
    expect(classifyEvent(e, rules, [])).toMatchObject({ typeId: 'montagem' });
    expect(classifyEvent({ title: 'Não marcar nada', description: 'Combinado com a diretoria' }, rules, [])).toMatchObject({ typeId: 'reserva' });
    expect(classifyEvent({ title: 'Gravação: Reels', description: 'Montagem de cenário' }, rules, [])).toMatchObject({ typeId: 'gravacao' });
  });
});

const at = (h: string) => zonedTime('2026-10-21', h);
const dup = (id: string, origin: 'calendar' | 'internal', source: string | null, title: string, start: string, end: string): DuplicateCandidate => ({
  id,
  origin,
  calendarSourceId: source,
  title,
  startsAt: at(start),
  endsAt: at(end),
});

describe('detecção de duplicados', () => {
  it.each<[string, DuplicateCandidate[], string[][]]>([
    [
      'UT-048 S1 e S2 com o mesmo título normalizado e horário',
      [dup('a', 'calendar', 'S1', 'Gravação Aula 3', '09:00', '12:00'), dup('b', 'calendar', 'S2', 'gravacao  aula 3', '09:00', '12:00')],
      [['a', 'b']],
    ],
    [
      'UT-048 início 30 min diferente',
      [dup('a', 'calendar', 'S1', 'Gravação Aula 3', '09:00', '12:00'), dup('b', 'calendar', 'S2', 'Gravação Aula 3', '09:30', '12:00')],
      [],
    ],
    [
      'UT-049 evento interno e evento da agenda',
      [dup('a', 'calendar', 'S1', 'Reunião de pauta', '14:00', '15:00'), dup('i', 'internal', null, 'Reunião de pauta', '14:00', '15:00')],
      [['a', 'i']],
    ],
    [
      'mesma agenda não é duplicado entre agendas',
      [dup('a', 'calendar', 'S1', 'Plantão', '14:00', '15:00'), dup('b', 'calendar', 'S1', 'Plantão', '14:00', '15:00')],
      [],
    ],
  ])('%s', (_name, events, groups) => {
    expect(detectDuplicates(events)).toEqual(groups);
  });
});
