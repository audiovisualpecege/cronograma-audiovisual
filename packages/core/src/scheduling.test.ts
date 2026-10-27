import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assign, event, person, slot, weekContext } from './cases/builders.ts';
import { ELIGIBILITY_CASES, eligibilityContext } from './cases/eligibility.ts';
import { SEED } from './cases/seed.ts';
import {
  buildHistoryIndex,
  buildProposalBatches,
  checkEligibility,
  daysOf,
  eventHours,
  personLoad,
  rankCandidates,
  eventSeries,
  proposeWeek,
  weekStartOf,
} from './scheduling.ts';
import { addDays, zonedTime } from './time.ts';
import type { AssignmentLike, EventLike, HistoryFact, PersonLike, SlotLike } from './types.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SEED.now));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('semana, fuso, duração e carga', () => {
  it.each([
    ['UT-001', '2026-10-21T15:00:00-03:00', '2026-10-19'],
    ['UT-002', '2026-10-26T02:30:00Z', '2026-10-19'],
    ['UT-003', '2026-10-26T03:00:00Z', '2026-10-26'],
  ])('%s weekStartOf(%s) devolve %s', (_id, instant, expected) => {
    expect(weekStartOf(new Date(instant))).toBe(expected);
  });

  it.each([
    ['UT-004 de 09:00 a 12:30', event('e', '2026-10-21', '09:00', '12:30'), 3.5],
    ['UT-005 dia inteiro sem período', event('e', '2026-10-21', '00:00', '00:00', { allDay: true, endDate: '2026-10-22' }), 0],
    [
      'UT-005 dia inteiro com período 08:00 a 18:00',
      event('e', '2026-10-21', '00:00', '00:00', {
        allDay: true,
        endDate: '2026-10-22',
        periodStart: zonedTime('2026-10-21', '08:00'),
        periodEnd: zonedTime('2026-10-21', '18:00'),
      }),
      10,
    ],
    ['UT-006 de 22:00 a 02:00 do dia seguinte', event('e', '2026-10-21', '22:00', '02:00', { endDate: '2026-10-22' }), 4],
  ])('%s: eventHours devolve %s', (_name, e, hours) => {
    expect(eventHours(e)).toBe(hours);
  });

  it.each([
    ['UT-006', event('e', '2026-10-21', '22:00', '02:00', { endDate: '2026-10-22' }), ['2026-10-21', '2026-10-22']],
    ['UT-007', event('e', '2026-10-21', '08:00', '18:00', { endDate: '2026-10-23' }), ['2026-10-21', '2026-10-22', '2026-10-23']],
    ['fim à meia-noite não ocupa o dia seguinte', event('e', '2026-10-21', '20:00', '00:00', { endDate: '2026-10-22' }), ['2026-10-21']],
  ])('%s daysOf devolve os dias que o evento ocupa', (_id, e, days) => {
    expect(daysOf(e)).toEqual(days);
  });

  it('UT-007 personLoad soma as horas de um evento de vários dias uma vez só', () => {
    const e = event('e1', '2026-10-21', '08:00', '18:00', { endDate: '2026-10-23' });
    const s = slot('s1', 'V1', 'e1');
    expect(personLoad('p5', weekContext({ events: [e], slots: [s], assignments: [assign(s, 'p5')] }))).toEqual({
      hours: 58,
      count: 1,
    });
  });

  it.each([
    [
      'UT-008 confirmadas de 3 h e 4 h e proposta de 2 h',
      [
        ['2026-10-19', '09:00', '12:00', 'active', 'confirmed'],
        ['2026-10-20', '09:00', '13:00', 'active', 'confirmed'],
        ['2026-10-22', '14:00', '16:00', 'active', 'proposed'],
      ],
      { hours: 9, count: 3 },
    ],
    [
      'UT-009 alocação de evento cancelado não conta',
      [
        ['2026-10-19', '09:00', '12:00', 'active', 'confirmed'],
        ['2026-10-20', '09:00', '13:00', 'cancelled', 'confirmed'],
      ],
      { hours: 3, count: 1 },
    ],
  ] as const)('%s', (_name, rows, expected) => {
    const events: EventLike[] = [];
    const slots: SlotLike[] = [];
    const assignments: AssignmentLike[] = [];
    rows.forEach(([date, start, end, status, aStatus], i) => {
      events.push(event(`e${i}`, date, start, end, { status }));
      const s = slot(`s${i}`, `V${i + 1}`, `e${i}`);
      slots.push(s);
      assignments.push(assign(s, 'p5', aStatus));
    });
    expect(personLoad('p5', weekContext({ events, slots, assignments }))).toEqual(expected);
  });

  it('personLoad só conta a semana do contexto', () => {
    const e = event('e1', '2026-10-27', '09:00', '12:00');
    const s = slot('s1', 'V1', 'e1');
    expect(personLoad('p5', weekContext({ events: [e], slots: [s], assignments: [assign(s, 'p5')] }))).toEqual({
      hours: 0,
      count: 0,
    });
  });
});

describe('aptidão', () => {
  it.each(ELIGIBILITY_CASES.map((c) => [c.id, c.title, c] as const))('%s %s', (_id, _title, c) => {
    const { ctx, personId, slotId } = eligibilityContext(c);
    const r = checkEligibility(personId, slotId, ctx);
    expect({ blockers: r.blockers, warnings: r.warnings }).toEqual(c.expected);
    expect(r.ok).toBe(c.expected.blockers.length === 0 && c.expected.warnings.length === 0);
  });

  it('UT-010 devolve exatamente { ok: true, blockers: [], warnings: [] }', () => {
    const c = ELIGIBILITY_CASES.find((x) => x.id === 'UT-010');
    if (!c) throw new Error('caso UT-010 ausente');
    const { ctx, personId, slotId } = eligibilityContext(c);
    expect(checkEligibility(personId, slotId, ctx)).toEqual({ ok: true, blockers: [], warnings: [] });
  });
});

// Vaga V1: quarta 21/10 14:00 a 17:00, Câmera (R1), tipo T1. A carga sai de alocações em outros dias.
function rankingScenario(people: { id: string; hist: number; loadHours: number; loadCount?: number; extra?: Partial<PersonLike> }[]) {
  const target = event('ev', '2026-10-21', '14:00', '17:00');
  const events: EventLike[] = [target];
  const slots: SlotLike[] = [slot('v1', 'V1', 'ev')];
  const assignments: AssignmentLike[] = [];
  const facts: HistoryFact[] = [];
  const days = ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
  for (const p of people) {
    const count = p.loadCount ?? (p.loadHours > 0 ? Math.ceil(p.loadHours / 8) : 0);
    for (let i = 0; i < count; i++) {
      const h = p.loadHours / count;
      const id = `load-${p.id}-${i}`;
      events.push({ ...event(id, days[i] as string, '06:00', '06:00'), endsAt: new Date(zonedTime(days[i] as string, '06:00').getTime() + h * 3_600_000) });
      const s = slot(`s-${id}`, `V${slots.length + 1}`, id);
      slots.push(s);
      assignments.push(assign(s, p.id));
    }
    for (let i = 0; i < p.hist; i++) {
      facts.push({ eventId: `h-${p.id}-${i}`, weekStart: '2026-01-05', eventDate: '2026-01-05', title: 'Gravação aula', serviceTypeId: 't1', jobRoleId: 'r1', personId: p.id, hours: 3 });
    }
  }
  const ids = new Set(people.map((p) => p.id));
  const ctx = weekContext({
    people: [...people.map((p) => person(p.id, { roleIds: ['r1'], ...p.extra }))],
    events,
    slots,
    assignments,
  });
  return { ctx: { ...ctx, people: ctx.people.filter((p) => ids.has(p.id)) }, history: buildHistoryIndex(facts) };
}

describe('ranking e lotes da pré-escala', () => {
  it.each([
    ['UT-022', [{ id: 'p3', hist: 10, loadHours: 30 }, { id: 'p4', hist: 3, loadHours: 0 }], ['p3', 'p4'], [true, false]],
    ['UT-023', [{ id: 'p3', hist: 10, loadHours: 30 }, { id: 'p4', hist: 8, loadHours: 5 }], ['p4', 'p3'], [true, true]],
    ['UT-024', [{ id: 'p3', hist: 10, loadHours: 30 }, { id: 'p4', hist: 7, loadHours: 5 }], ['p3', 'p4'], [true, false]],
    [
      'UT-025',
      [
        { id: 'p3', hist: 0, loadHours: 12, loadCount: 2 },
        { id: 'p4', hist: 0, loadHours: 12, loadCount: 1 },
        { id: 'p5', hist: 0, loadHours: 20, loadCount: 3 },
      ],
      ['p4', 'p3', 'p5'],
      [true, true, true],
    ],
  ] as const)('%s ordena os aptos pelo histórico e, no empate próximo, pela menor carga', (_id, people, order, tie) => {
    const { ctx, history } = rankingScenario(people.map((p) => ({ ...p })));
    const ranked = rankCandidates('v1', ctx, history);
    expect(ranked.map((c) => c.personId)).toEqual(order);
    expect(ranked.map((c) => c.inTieGroup)).toEqual(tie);
  });

  describe('horário de trabalho e sede', () => {
    // A vaga é quarta 21/10, 14:00 a 17:00.
    const morning = { '1': ['08:00', '13:00'], '2': ['08:00', '13:00'], '3': ['08:00', '13:00'], '4': ['08:00', '13:00'], '5': ['08:00', '13:00'] } as const;
    const fullDay = { '3': ['08:00', '18:00'] } as const;

    it('fora do horário é aviso, não bloqueio; dia sem horário conta como fora; sem horário cadastrado não pesa', () => {
      const { ctx } = rankingScenario([
        { id: 'p3', hist: 0, loadHours: 0, extra: { workHours: morning } },
        { id: 'p4', hist: 0, loadHours: 0, extra: { workHours: fullDay } },
        { id: 'p5', hist: 0, loadHours: 0, extra: { workHours: { '1': ['08:00', '18:00'] } } },
        { id: 'p6', hist: 0, loadHours: 0 },
      ]);
      expect(checkEligibility('p3', 'v1', ctx).warnings).toEqual(['off_hours']);
      expect(checkEligibility('p4', 'v1', ctx).warnings).toEqual([]);
      expect(checkEligibility('p5', 'v1', ctx).warnings).toEqual(['off_hours']);
      expect(checkEligibility('p6', 'v1', ctx).ok).toBe(true);
    });

    it('turma fixa manda; depois quem está no horário; quem está fora vem por último, pelo histórico, com a marca', () => {
      const { ctx } = rankingScenario([
        { id: 'p3', hist: 0, loadHours: 0, extra: { workHours: morning } },
        { id: 'p4', hist: 0, loadHours: 0, extra: { workHours: morning } },
        { id: 'p5', hist: 0, loadHours: 0, extra: { workHours: fullDay } },
        { id: 'p6', hist: 0, loadHours: 0, extra: { workHours: morning } },
      ]);
      const fact = (personId: string, weekStart: string, title: string) =>
        ({ eventId: `h-${personId}-${weekStart}`, weekStart, eventDate: weekStart, title, serviceTypeId: 't1', jobRoleId: 'r1', personId, hours: 3 });
      const history = buildHistoryIndex([
        fact('p6', '2026-10-12', 'MBA Agro'),
        ...Array.from({ length: 5 }, (_, i) => fact('p4', addDays('2026-01-05', 7 * i), 'Outra coisa')),
      ]);
      const titled = { ...ctx, events: ctx.events.map((e) => (e.id === 'ev' ? { ...e, title: 'MBA Agro' } : e)) };
      const ranked = rankCandidates('v1', titled, history);
      expect(ranked.map((c) => c.personId)).toEqual(['p6', 'p5', 'p4', 'p3']);
      expect(ranked.map((c) => Boolean(c.offHours))).toEqual([true, false, true, true]);
    });

    it('externo é só de Piracicaba; aula de outra sede não entra; sem sede não pesa', () => {
      const { ctx } = rankingScenario([
        { id: 'p3', hist: 0, loadHours: 0, extra: { base: 'sao_paulo' } },
        { id: 'p4', hist: 0, loadHours: 0, extra: { base: 'piracicaba' } },
        { id: 'p5', hist: 0, loadHours: 0 },
      ]);
      const withEvent = (patch: Partial<EventLike>) => ({ ...ctx, events: ctx.events.map((e) => (e.id === 'ev' ? { ...e, ...patch } : e)) });
      const ranked = (patch: Partial<EventLike>) => rankCandidates('v1', withEvent(patch), buildHistoryIndex([])).map((c) => c.personId);
      expect(ranked({ external: true })).toEqual(['p4', 'p5']);
      expect(checkEligibility('p3', 'v1', withEvent({ external: true })).warnings).toEqual(['other_base']);
      expect(ranked({ base: 'sao_paulo' })).toEqual(['p3', 'p5']);
      expect(ranked({})).toEqual(['p3', 'p4', 'p5']);
    });
  });

  describe('turma fixa, prioridade e nível', () => {
    const fact = (personId: string, weekStart: string, title = 'Gravação aula') =>
      ({ eventId: `h-${personId}-${weekStart}-${title}`, weekStart, eventDate: weekStart, title, serviceTypeId: 't1', jobRoleId: 'r1', personId, hours: 3 });
    const titled = (ctx: ReturnType<typeof rankingScenario>['ctx'], title: string, complex = false) => ({
      ...ctx,
      events: ctx.events.map((e) => (e.id === 'ev' ? { ...e, title, complex } : e)),
    });

    it('quem fez o mesmo evento nas 8 semanas antes vai na frente, mesmo com menos histórico e mais carga', () => {
      const { ctx } = rankingScenario([{ id: 'p3', hist: 0, loadHours: 20 }, { id: 'p4', hist: 0, loadHours: 0 }]);
      const history = buildHistoryIndex([
        ...Array.from({ length: 30 }, (_, i) => fact('p4', addDays('2025-01-06', 7 * i))),
        fact('p3', '2026-10-12', 'MBA em Gestão de Projetos - Aula 7'),
        // Fora da janela de 8 semanas: não conta como turma fixa.
        fact('p4', '2026-06-01', 'MBA em Gestão de Projetos'),
      ]);
      const ranked = rankCandidates('v1', titled(ctx, 'MBA em Gestão de Projetos - Aula 8'), history);
      expect(ranked.map((c) => c.personId)).toEqual(['p3', 'p4']);
      expect(ranked[0]).toMatchObject({ series: 1 });
      expect(eventSeries('MBA em Gestão de Projetos - Aula 8')).toBe(eventSeries('MBA em Gestão de Projetos: Aula 3'));
    });

    it('série: só a primeira linha do título, sem o rótulo curto antes de ":"', () => {
      expect(eventSeries('MBA em Marketing\nDisciplina: Plataformas Digitais')).toBe(eventSeries('MBA em Marketing\nDisciplina: Branding'));
      expect(eventSeries('GRAVAÇÃO: Virada Empresarial')).not.toBe(eventSeries('GRAVAÇÃO: Chiaro Reels'));
      expect(eventSeries('*DISPONIBILIZAR: English@USP - Focus on Reading')).toBe('english usp focus on reading');
    });

    it('proposeWeek dá a vaga a quem é da turma fixa antes que outro evento no mesmo horário o ocupe', () => {
      // p3 é da turma fixa de "MBA B" e também o maior histórico geral; "MBA A" vem antes na ordem.
      const ctx = weekContext({
        people: [person('p3', { roleIds: ['r1'] }), person('p4', { roleIds: ['r1'] })],
        events: [{ ...event('a', '2026-10-21', '19:00', '23:00'), title: 'MBA A' }, { ...event('b', '2026-10-21', '19:00', '23:00'), title: 'MBA B' }],
        slots: [slot('va', 'V1', 'a'), slot('vb', 'V2', 'b')],
        assignments: [],
      });
      const history = buildHistoryIndex([
        ...Array.from({ length: 20 }, (_, i) => fact('p3', addDays('2025-01-06', 7 * i), 'MBA X')),
        fact('p3', '2026-10-12', 'MBA B'),
      ]);
      const picks = proposeWeek(ctx, history);
      expect(picks.get('vb')?.personId).toBe('p3');
      expect(picks.get('va')?.personId).toBe('p4');
    });

    it('o recente pesa mais que o antigo', () => {
      const { ctx } = rankingScenario([{ id: 'p3', hist: 0, loadHours: 0 }, { id: 'p4', hist: 0, loadHours: 10 }]);
      const history = buildHistoryIndex([
        ...Array.from({ length: 10 }, (_, i) => fact('p3', addDays('2023-01-02', 7 * i))),
        ...Array.from({ length: 6 }, (_, i) => fact('p4', addDays('2026-08-03', 7 * i))),
      ]);
      // p3 tem mais vezes (10 x 6), mas de três anos atrás; p4 fez agora e vai na frente apesar da carga.
      expect(rankCandidates('v1', titled(ctx, 'Outro'), history).map((c) => c.personId)).toEqual(['p4', 'p3']);
    });

    it('a última vez na função e no mesmo evento, só antes da semana', () => {
      const history = buildHistoryIndex([fact('p3', '2026-09-28', 'MBA B - Aula 2'), fact('p3', '2026-10-12', 'MBA B - Aula 4'), fact('p3', '2026-11-02', 'MBA B - Aula 7'), fact('p3', '2026-10-05', 'Outro')]);
      expect(history.lastWeek?.('p3', 'r1', 't1', '2026-10-26')).toBe('2026-10-12');
      expect(history.lastWeek?.('p4', 'r1', 't1', '2026-10-26')).toBeNull();
      expect(history.lastSeriesWeek?.('p3', 'r1', 'MBA B - Aula 5', '2026-10-26')).toBe('2026-10-12');
      expect(history.lastSeriesWeek?.('p3', 'r1', 'MBA C', '2026-10-26')).toBeNull();
    });

    it('no empate, a função principal da pessoa vem antes da carga', () => {
      const { ctx, history } = rankingScenario([
        { id: 'p3', hist: 0, loadHours: 10, extra: { rolePriority: ['r1', 'r2'] } },
        { id: 'p4', hist: 0, loadHours: 0, extra: { rolePriority: ['r2', 'r1'] } },
      ]);
      expect(rankCandidates('v1', ctx, history).map((c) => [c.personId, c.priority])).toEqual([['p3', 0], ['p4', 1]]);
    });

    it('trabalho complexo pede a Referência primeiro; no simples, a Referência vai por último', () => {
      const { ctx, history } = rankingScenario([
        { id: 'p3', hist: 0, loadHours: 0, extra: { roleLevels: { r1: 3 } } },
        { id: 'p4', hist: 0, loadHours: 5, extra: { roleLevels: { r1: 2 } } },
        { id: 'p5', hist: 0, loadHours: 9, extra: { roleLevels: { r1: 1 } } },
      ]);
      expect(rankCandidates('v1', titled(ctx, 'Evento', true), history).map((c) => c.personId)).toEqual(['p3', 'p4', 'p5']);
      // Simples: Apoio e Titular empatam e vão pela carga; a Referência fica por último, livre para o complexo.
      expect(rankCandidates('v1', titled(ctx, 'Aula', false), history).map((c) => c.personId)).toEqual(['p4', 'p5', 'p3']);
    });
  });

  it('UT-022 a carga e o histórico de cada candidato vêm junto', () => {
    const { ctx, history } = rankingScenario([
      { id: 'p3', hist: 10, loadHours: 30 },
      { id: 'p4', hist: 3, loadHours: 0 },
    ]);
    expect(rankCandidates('v1', ctx, history)).toEqual([
      { personId: 'p3', code: 'P3', hist: 10, loadHours: 30, loadCount: 4, inTieGroup: true },
      { personId: 'p4', code: 'P4', hist: 3, loadHours: 0, loadCount: 0, inTieGroup: false },
    ]);
  });

  it.each([
    ['ausente', { absent: true }],
    ['inativa', { extra: { active: false } }],
    ['que passaria do limite', { loadHours: 42 }],
  ] as const)('UT-026 pessoa %s não aparece na lista', (_name, how) => {
    const { ctx, history } = rankingScenario([
      { id: 'p3', hist: 5, loadHours: 0 },
      { id: 'p4', hist: 5, loadHours: 'loadHours' in how ? how.loadHours : 0, extra: 'extra' in how ? how.extra : {} },
    ]);
    if ('absent' in how) {
      ctx.absences.push({ personId: 'p4', startsAt: zonedTime('2026-10-21', '00:00'), endsAt: zonedTime('2026-10-22', '00:00') });
    }
    expect(rankCandidates('v1', ctx, history).map((c) => c.personId)).toEqual(['p3']);
  });

  it('UT-027 buildProposalBatches não inclui vagas confirmadas nem travadas', () => {
    const events = ['a', 'b', 'c', 'd'].map((x, i) => event(`e${x}`, '2026-10-22', `${10 + i}:00`, `${11 + i}:00`));
    const slots = events.map((e, i) => slot(`s${i}`, `V${i + 1}`, e.id));
    const ctx = weekContext({
      events,
      slots,
      assignments: [
        assign(slots[0] as SlotLike, 'p3', 'confirmed'),
        assign(slots[1] as SlotLike, 'p4', 'proposed', true),
        assign(slots[2] as SlotLike, 'p5', 'proposed'),
      ],
    });
    const batches = buildProposalBatches(ctx, buildHistoryIndex([]));
    expect(batches.flatMap((b) => b.slots.map((s) => s.slot))).toEqual(['V3', 'V4']);
  });

  function bigWeek() {
    // 130 vagas de 30 min, de segunda a domingo, 06:00 em diante, todas de Câmera.
    const events: EventLike[] = [];
    const slots: SlotLike[] = [];
    for (let i = 0; i < 130; i++) {
      const day = addDays(SEED.weekA, Math.floor(i / 19));
      const m = 6 * 60 + (i % 19) * 30;
      const t = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
      events.push(event(`e${i}`, day, t(m), t(m + 30)));
      slots.push(slot(`s${i}`, `V${i + 1}`, `e${i}`));
    }
    // A ordem cronológica não depende da ordem de entrada.
    return weekContext({ events, slots: [...slots].reverse() });
  }

  it('UT-028 130 vagas viram lotes de 60, 60 e 10 em ordem cronológica, com até 5 candidatos e carga levada adiante', () => {
    const batches = buildProposalBatches(bigWeek(), buildHistoryIndex([]));
    expect(batches.map((b) => b.slots.length)).toEqual([60, 60, 10]);
    const starts = batches.flatMap((b) => b.slots.map((s) => new Date(s.start).getTime()));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(batches.flatMap((b) => b.slots.map((s) => s.slot)).slice(0, 3)).toEqual(['V1', 'V2', 'V3']);
    for (const b of batches) for (const s of b.slots) expect(s.candidates.length).toBeLessThanOrEqual(5);
    expect(Math.max(...batches[0]!.slots.map((s) => s.candidates.length))).toBe(5);

    const load = (b: number) => batches[b]!.people.reduce((sum, p) => sum + p.loadHours, 0);
    expect(load(0)).toBe(0);
    // O lote 2 já recebe a carga provável do lote 1 (60 vagas de 30 min divididas entre os aptos).
    expect(load(1)).toBeGreaterThan(0);
    expect(load(2)).toBeGreaterThan(load(1));
    for (const c of batches[1]!.slots[0]!.candidates) expect(c.loadHours).toBeGreaterThan(0);
  });

  it('UT-028 escolhas já feitas no lote anterior saem das vagas e entram na carga', () => {
    const ctx = bigWeek();
    const prior = Array.from({ length: 60 }, (_, i) => ({ slotId: `s${i}`, personId: 'p5' }));
    const batches = buildProposalBatches(ctx, buildHistoryIndex([]), { prior, maxCandidates: 10 });
    expect(batches.map((b) => b.slots.length)).toEqual([60, 10]);
    expect(batches[0]!.slots[0]!.slot).toBe('V61');
    const p5 = batches[0]!.slots.flatMap((s) => s.candidates).find((c) => c.person === 'P5');
    expect(p5?.loadHours).toBe(30);
  });

  it('UT-029 o lote só leva códigos P, R, T e V, nunca nome nem e-mail', () => {
    const batches = buildProposalBatches(bigWeek(), buildHistoryIndex([]));
    const json = JSON.stringify(batches);
    for (const p of SEED.people) {
      expect(json).not.toContain(p.name);
      expect(json).not.toContain(p.email);
    }
    expect(json).not.toMatch(/"(name|email)"/);
    for (const b of batches) {
      for (const s of b.slots) {
        expect(s.slot).toMatch(/^V\d+$/);
        expect(s.role).toMatch(/^R\d+$/);
        expect(s.type).toMatch(/^T\d+$/);
        for (const c of s.candidates) expect(c.person).toMatch(/^P\d+$/);
      }
      for (const p of b.people) expect(p.person).toMatch(/^P\d+$/);
    }
  });
});
