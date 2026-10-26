import { describe, expect, it } from 'vitest';
import { buildSeriesSizes, effectiveSize, suggestSize } from './eventSize.ts';
import { validateServiceType } from './validate.ts';

const fact = (eventId: string, eventDate: string, title: string, personId: string | null) => ({ eventId, eventDate, title, personId });
const EVENTO = { 1: 1, 2: 3, 3: 8 } as const;

describe('porte do evento', () => {
  it('sem escolha vale o padrão do tipo (Simples sem padrão); tipo sem porte usa a equipe única', () => {
    expect(effectiveSize(null, true)).toBe(1);
    expect(effectiveSize(null, true, 2)).toBe(2);
    expect(effectiveSize(3, true, 2)).toBe(3);
    expect(effectiveSize(3, true)).toBe(3);
    expect(effectiveSize(3, false)).toBe(2);
    expect(effectiveSize(7, true)).toBe(1);
  });

  it('conta as pessoas de cada vez da série, com nome não reconhecido contando como uma pessoa', () => {
    const sizes = buildSeriesSizes([
      fact('a', '2026-05-01', 'EVENTO: Festa das Nações', 'p1'),
      fact('a', '2026-05-01', 'EVENTO: Festa das Nações', 'p2'),
      fact('a', '2026-05-01', 'EVENTO: Festa das Nações', null),
      fact('a', '2026-05-01', 'EVENTO: Festa das Nações', 'p1'),
    ]);
    expect(sizes.get('festa das nacoes')).toEqual([{ date: '2026-05-01', people: 3 }]);
  });

  it('sugere o porte cuja equipe chega mais perto da mediana das últimas vezes', () => {
    const facts = [
      ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((p) => fact('f1', '2025-05-10', 'Evento: Festa das Nações', p)),
      ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].map((p) => fact('f2', '2026-05-14', 'EVENTO: Festa das Nações', p)),
      fact('r1', '2026-04-29', 'Evento Raízen', 'p1'),
      fact('s1', '2026-02-01', 'Sessão Solene IFSP', 'p1'),
      fact('s1', '2026-02-01', 'Sessão Solene IFSP', 'p2'),
      fact('s1', '2026-02-01', 'Sessão Solene IFSP', 'p3'),
    ];
    const sizes = buildSeriesSizes(facts);
    expect(suggestSize('EVENTO: Festa das Nações', sizes, EVENTO, '2026-10-19')).toEqual({ size: 3, people: 8, events: 2 });
    expect(suggestSize('Evento Raízen', sizes, EVENTO)).toMatchObject({ size: 1 });
    expect(suggestSize('Sessão Solene IFSP', sizes, EVENTO)).toMatchObject({ size: 2 });
    expect(suggestSize('Evento novo nunca visto', sizes, EVENTO)).toBeNull();
    // Só o passado conta.
    expect(suggestSize('Sessão Solene IFSP', sizes, EVENTO, '2026-01-01')).toBeNull();
  });

  it('empate fica com o porte menor', () => {
    const sizes = buildSeriesSizes([fact('a', '2026-01-01', 'Podcast X', 'p1'), fact('a', '2026-01-01', 'Podcast X', 'p2')]);
    expect(suggestSize('Podcast X', sizes, { 1: 1, 2: 3, 3: 4 })).toMatchObject({ size: 1, people: 2 });
  });

  it('tipo com porte precisa de alguém nos três portes', () => {
    const crew = [
      { jobRoleId: 'r1', quantity: 1, size: 1 },
      { jobRoleId: 'r1', quantity: 2, size: 2 },
    ];
    expect(validateServiceType({ name: 'EVENTO', crew, noTeam: false, sized: true }).errors).toEqual(['size_without_crew']);
    expect(validateServiceType({ name: 'EVENTO', crew: [...crew, { jobRoleId: 'r1', quantity: 8, size: 3 }], noTeam: false, sized: true }).ok).toBe(true);
    expect(validateServiceType({ name: 'EVENTO', crew, noTeam: false }).ok).toBe(true);
  });
});
