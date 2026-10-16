import { describe, expect, it } from 'vitest';
import { diffPublication } from './publication.ts';
import type { PersonChange, PubRow } from './types.ts';

const row = (eventId: string, jobRoleId: string, personId: string | null): PubRow => ({ eventId, jobRoleId, personId });

describe('diferença de publicação', () => {
  it.each<[string, PubRow[], PubRow[], PersonChange[] | undefined]>([
    ['UT-030 P7 entra', [row('E1', 'r1', null)], [row('E1', 'r1', 'p7')], [{ kind: 'entrou', eventId: 'E1', jobRoleId: 'r1' }]],
    ['UT-031 P7 sai', [row('E1', 'r1', 'p7')], [row('E1', 'r1', null)], [{ kind: 'saiu', eventId: 'E1', jobRoleId: 'r1' }]],
    [
      'UT-032 P7 troca E1 por E2 na mesma função',
      [row('E1', 'r1', 'p7')],
      [row('E2', 'r1', 'p7')],
      [{ kind: 'mudou_evento', eventId: 'E2', jobRoleId: 'r1', fromEventId: 'E1', fromJobRoleId: 'r1' }],
    ],
    [
      'UT-033 P7 passa de R1 para R2 no mesmo evento',
      [row('E1', 'r1', 'p7')],
      [row('E1', 'r2', 'p7')],
      [{ kind: 'mudou_funcao', eventId: 'E1', jobRoleId: 'r2', fromEventId: 'E1', fromJobRoleId: 'r1' }],
    ],
    ['UT-034 P7 removido e reposto na mesma vaga', [row('E1', 'r1', 'p7')], [row('E1', 'r1', 'p7')], undefined],
  ])('%s', (_name, prev, next, expected) => {
    const diff = diffPublication(prev, next);
    expect(diff.get('p7')).toEqual(expected);
    if (!expected) expect(diff.size).toBe(0);
  });

  it('UT-035 três mudanças de P7 viram uma entrada só com as três', () => {
    const prev = [row('E1', 'r1', 'p7'), row('E2', 'r1', 'p7'), row('E3', 'r1', 'p7'), row('E9', 'r3', 'p8')];
    const next = [row('E1', 'r2', 'p7'), row('E4', 'r1', 'p7'), row('E5', 'r6', 'p7'), row('E9', 'r3', 'p8')];
    const diff = diffPublication(prev, next);
    expect([...diff.keys()]).toEqual(['p7']);
    expect(diff.get('p7')).toEqual([
      { kind: 'mudou_funcao', eventId: 'E1', jobRoleId: 'r2', fromEventId: 'E1', fromJobRoleId: 'r1' },
      { kind: 'mudou_evento', eventId: 'E4', jobRoleId: 'r1', fromEventId: 'E2', fromJobRoleId: 'r1' },
      { kind: 'entrou', eventId: 'E5', jobRoleId: 'r6' },
      { kind: 'saiu', eventId: 'E3', jobRoleId: 'r1' },
    ]);
  });
});
