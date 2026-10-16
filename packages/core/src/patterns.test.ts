import { describe, expect, it } from 'vitest';
import { person } from './cases/builders.ts';
import { matchName, normalizeName } from './names.ts';
import { mergeAbsences, personPatterns, roleDemandSupply, suggestCatalogFromHistory, suggestCrew, typeStats } from './patterns.ts';
import { zonedTime } from './time.ts';
import type { HistoryFact } from './types.ts';
import { validateAbsence, validateName, validateNotes, validatePerson, validateServiceType } from './validate.ts';

function fact(eventId: string, eventDate: string, serviceTypeId: string, jobRoleId: string, personId: string, hours = 3): HistoryFact {
  return { eventId, weekStart: eventDate, eventDate, title: eventId, serviceTypeId, jobRoleId, personId, hours };
}

describe('nomes', () => {
  it('UT-050 normalizeName tira acentos, maiúsculas e espaços', () => {
    expect(normalizeName(' Função  Câmera ')).toBe('funcao camera');
  });

  it('UT-051 "Joao P." sugere João Pedro Silva primeiro, com nota maior que 0,5', () => {
    const r = matchName('Joao P.', ['Maria Souza', 'João Pedro Silva']);
    expect(r[0]?.name).toBe('João Pedro Silva');
    expect(r[0]?.score).toBeGreaterThan(0.5);
    expect(r.map((m) => m.name)).not.toContain('Maria Souza');
  });

  it.each([
    ['UT-052 "Zé" não casa com Maria Souza', 'Zé', ['Maria Souza']],
    ['primeiro nome diferente não casa', 'Ana', ['Mariana Lima']],
  ])('%s', (_name, raw, list) => {
    expect(matchName(raw, list)).toEqual([]);
  });

  it('apelidos das planilhas casam com o nome do cadastro', () => {
    expect(matchName('Fe Rocha', [{ id: 'p1', name: 'Felipe Rocha' }, { id: 'p2', name: 'Fernanda Dias' }])[0]).toMatchObject({ id: 'p1' });
  });
});

describe('validadores', () => {
  it('UT-055 e-mail "a@" é email_invalid', () => {
    expect(validatePerson({ name: 'Ana', email: 'a@', roleIds: ['r1'] }).errors).toEqual(['email_invalid']);
  });

  it.each([
    ['UT-056 limite 0', 0, ['invalid_limit'], 0],
    ['UT-056 limite 81', 81, ['invalid_limit'], 81],
    ['UT-056 limite 1', 1, [], 1],
    ['UT-056 limite 80', 80, [], 80],
    ['UT-056 limite vazio vira 44', '', [], 44],
    ['UT-056 limite nulo vira 44', null, [], 44],
  ] as const)('%s', (_name, limit, errors, value) => {
    const r = validatePerson({ name: 'Ana', email: 'ana@exemplo.test', weeklyLimitHours: limit, roleIds: ['r1'] });
    expect(r.errors).toEqual(errors);
    expect(r.value.weeklyLimitHours).toBe(value);
  });

  it.each([
    ['UT-057 nome vazio', { name: '  ', roleIds: ['r1'] }, ['name_required']],
    ['UT-057 sem funções', { name: 'Ana', roleIds: [] }, ['roles_required']],
  ])('%s', (_name, input, errors) => {
    expect(validatePerson({ email: 'ana@exemplo.test', ...input }).errors).toEqual(errors);
  });

  it.each([
    ['UT-058 quantidade 0', [{ jobRoleId: 'r1', quantity: 0 }], false, ['invalid_quantity']],
    ['UT-058 quantidade 31', [{ jobRoleId: 'r1', quantity: 31 }], false, ['invalid_quantity']],
    ['UT-058 quantidade 30', [{ jobRoleId: 'r1', quantity: 30 }], false, []],
    ['UT-058 sem equipe e sem "não exige equipe"', [], false, ['type_without_crew']],
    ['UT-058 sem equipe e com "não exige equipe"', [], true, []],
  ])('%s', (_name, crew, noTeam, errors) => {
    expect(validateServiceType({ name: 'Evento externo', crew, noTeam }).errors).toEqual(errors);
  });

  it('nome repetido sem diferenciar maiúsculas e acentos é name_taken', () => {
    expect(validateName('CAMERA', ['Câmera', 'Áudio']).errors).toEqual(['name_taken']);
    expect(validateName('', []).errors).toEqual(['name_required']);
  });

  it.each([
    ['UT-059 fim antes do início', ['2026-10-22', '10:00'], ['2026-10-21', '10:00'], ['end_before_start'], false],
    ['UT-059 61 dias pede confirmação', ['2026-10-01', '00:00'], ['2026-12-01', '00:00'], [], true],
    ['UT-059 60 dias não pede', ['2026-10-01', '00:00'], ['2026-11-30', '00:00'], [], false],
  ] as const)('%s', (_name, from, to, errors, confirm) => {
    const r = validateAbsence({ startsAt: zonedTime(from[0], from[1]), endsAt: zonedTime(to[0], to[1]) });
    expect(r.errors).toEqual(errors);
    expect(r.needsConfirmation).toBe(confirm);
  });

  it.each([
    ['UT-060 2.001 caracteres', 2001, ['notes_too_long']],
    ['UT-060 2.000 caracteres', 2000, []],
  ] as const)('%s', (_name, size, errors) => {
    expect(validateNotes('x'.repeat(size)).errors).toEqual(errors);
  });
});

describe('padrões', () => {
  it('UT-053 suggestCrew com R1 [2, 2, 3] em T2 devolve R1 = 2', () => {
    const facts = [
      ...['p3', 'p4'].map((p) => fact('e1', '2026-03-02', 't2', 'r1', p)),
      ...['p3', 'p5'].map((p) => fact('e2', '2026-03-09', 't2', 'r1', p)),
      ...['p3', 'p4', 'p5'].map((p) => fact('e3', '2026-03-16', 't2', 'r1', p)),
      fact('e1', '2026-03-02', 't2', 'r2', 'p9'),
    ];
    expect(suggestCrew(facts, 't2')).toEqual([
      { jobRoleId: 'r1', quantity: 2 },
      { jobRoleId: 'r2', quantity: 1 },
    ]);
  });

  it.each([
    ['UT-054 2 eventos', 2, true],
    ['UT-054 3 eventos', 3, false],
  ] as const)('%s: lowHistory=%s', (_name, n, low) => {
    const facts = Array.from({ length: n }, (_, i) => fact(`e${i}`, '2026-03-02', 't1', 'r1', 'p5'));
    expect(typeStats(facts)[0]).toMatchObject({ serviceTypeId: 't1', events: n, lowHistory: low });
  });

  it('UT-152 personPatterns(P5) devolve os 3 tipos e funções mais feitos e a carga média semanal', () => {
    const facts: HistoryFact[] = [];
    const add = (n: number, type: string, role: string) => {
      for (let i = 0; i < n; i++) {
        const week = i % 2 === 0 ? '2026-03-02' : '2026-03-09';
        facts.push(fact(`${type}-${role}-${i}`, week, type, role, 'p5', 2));
      }
    };
    add(4, 't1', 'r1');
    add(3, 't2', 'r1');
    add(2, 't3', 'r5');
    add(1, 't4', 'r2');
    facts.push(fact('outro', '2026-03-02', 't1', 'r1', 'p6', 10));
    expect(personPatterns('p5', facts)).toEqual({
      personId: 'p5',
      types: [
        { serviceTypeId: 't1', count: 4 },
        { serviceTypeId: 't2', count: 3 },
        { serviceTypeId: 't3', count: 2 },
      ],
      roles: [
        { jobRoleId: 'r1', count: 7 },
        { jobRoleId: 'r5', count: 2 },
        { jobRoleId: 'r2', count: 1 },
      ],
      weeks: 2,
      avgWeeklyHours: 10,
      avgWeeklyCount: 5,
    });
  });

  it('UT-153 filtro de 01/2026 a 06/2026 recalcula typeStats só com esse período', () => {
    const facts = [
      fact('dez', '2025-12-08', 't1', 'r1', 'p5'),
      fact('mar1', '2026-03-02', 't1', 'r1', 'p5'),
      fact('mar2', '2026-03-09', 't1', 'r1', 'p6'),
      fact('jun', '2026-06-29', 't2', 'r1', 'p5'),
      fact('jul', '2026-07-06', 't2', 'r1', 'p5'),
    ];
    expect(typeStats(facts).map((t) => [t.serviceTypeId, t.events])).toEqual([
      ['t1', 3],
      ['t2', 2],
    ]);
    const period = typeStats(facts, { from: '2026-01-01', to: '2026-06-30' });
    expect(period.map((t) => [t.serviceTypeId, t.events, t.lowHistory])).toEqual([
      ['t1', 2, true],
      ['t2', 1, true],
    ]);
    expect(period[0]?.topPeople).toEqual([{ jobRoleId: 'r1', people: [{ personId: 'p5', count: 1 }, { personId: 'p6', count: 1 }] }]);
  });

  it('UT-151 sugere as funções e os tipos do histórico que faltam no cadastro', () => {
    const r = suggestCatalogFromHistory(
      { roles: ['R1', 'R2', 'Drone', 'r1', 'drone', 'R2', 'Drone'], types: ['Gravação de aula', 'Webinar', 'gravacao de aula', 'Fotos'] },
      { roles: ['R1'], types: ['Gravação de Aula'] },
    );
    expect(r).toEqual({ roles: ['Drone', 'R2'], types: ['Webinar', 'Fotos'] });
  });

  it('UT-070 30 h pedidas de R1 e 20 h disponíveis marcam R1 em falta de 10 h', () => {
    const people = [person('p3', { roleIds: ['r1'], weeklyLimitHours: 25 }), person('p9', { roleIds: ['r2'], weeklyLimitHours: 44 })];
    const absences = [{ personId: 'p3', startsAt: zonedTime('2026-10-20', '00:00'), endsAt: zonedTime('2026-10-21', '00:00') }];
    const r = roleDemandSupply({
      weekStart: '2026-10-19',
      demand: [
        { jobRoleId: 'r1', hours: 18 },
        { jobRoleId: 'r1', hours: 12 },
        { jobRoleId: 'r2', hours: 4 },
      ],
      people,
      absences,
    });
    expect(r).toEqual([
      { jobRoleId: 'r1', demandHours: 30, supplyHours: 20, shortHours: 10, short: true },
      { jobRoleId: 'r2', demandHours: 4, supplyHours: 44, shortHours: 0, short: false },
    ]);
  });

  it('UT-061 ausências 20/10 a 22/10 e 21/10 a 24/10 viram um período 20/10 a 24/10', () => {
    const merged = mergeAbsences([
      { personId: 'p5', startsAt: zonedTime('2026-10-21', '00:00'), endsAt: zonedTime('2026-10-25', '00:00') },
      { personId: 'p5', startsAt: zonedTime('2026-10-20', '00:00'), endsAt: zonedTime('2026-10-23', '00:00') },
      { personId: 'p6', startsAt: zonedTime('2026-10-20', '00:00'), endsAt: zonedTime('2026-10-21', '00:00') },
    ]);
    expect(merged).toEqual([
      { personId: 'p5', startsAt: zonedTime('2026-10-20', '00:00'), endsAt: zonedTime('2026-10-25', '00:00') },
      { personId: 'p6', startsAt: zonedTime('2026-10-20', '00:00'), endsAt: zonedTime('2026-10-21', '00:00') },
    ]);
  });
});
