// Diferença entre duas fotografias publicadas, por pessoa (ADR-011).
import type { PersonChange, PubRow } from './types.ts';

interface Pair {
  eventId: string;
  jobRoleId: string;
}

const key = (p: Pair) => `${p.eventId}|${p.jobRoleId}`;

function pairsByPerson(rows: PubRow[]): Map<string, Map<string, Pair>> {
  const out = new Map<string, Map<string, Pair>>();
  for (const r of rows) {
    if (!r.personId) continue;
    let m = out.get(r.personId);
    if (!m) out.set(r.personId, (m = new Map()));
    m.set(key(r), { eventId: r.eventId, jobRoleId: r.jobRoleId });
  }
  return out;
}

const byPair = (a: Pair, b: Pair) => a.eventId.localeCompare(b.eventId) || a.jobRoleId.localeCompare(b.jobRoleId);

/**
 * Mudanças de cada pessoa entre a fotografia anterior e a nova. Uma alocação desfeita antes de
 * publicar não aparece. Mesmo evento com outra função é `mudou_funcao`; mesma função noutro evento é
 * `mudou_evento`; o resto é `entrou` ou `saiu`. Pessoas sem mudança não entram no mapa.
 */
export function diffPublication(prev: PubRow[], next: PubRow[]): Map<string, PersonChange[]> {
  const before = pairsByPerson(prev);
  const after = pairsByPerson(next);
  const people = [...new Set([...before.keys(), ...after.keys()])].sort();
  const result = new Map<string, PersonChange[]>();

  for (const person of people) {
    const b = before.get(person) ?? new Map<string, Pair>();
    const a = after.get(person) ?? new Map<string, Pair>();
    const removed = [...b.entries()].filter(([k]) => !a.has(k)).map(([, p]) => p).sort(byPair);
    const added = [...a.entries()].filter(([k]) => !b.has(k)).map(([, p]) => p).sort(byPair);
    const changes: PersonChange[] = [];

    const take = (match: (r: Pair, n: Pair) => boolean, kind: 'mudou_funcao' | 'mudou_evento') => {
      for (let i = 0; i < added.length; ) {
        const n = added[i] as Pair;
        const j = removed.findIndex((r) => match(r, n));
        if (j < 0) {
          i++;
          continue;
        }
        const [r] = removed.splice(j, 1) as [Pair];
        added.splice(i, 1);
        changes.push({ kind, eventId: n.eventId, jobRoleId: n.jobRoleId, fromEventId: r.eventId, fromJobRoleId: r.jobRoleId });
      }
    };
    take((r, n) => r.eventId === n.eventId, 'mudou_funcao');
    take((r, n) => r.jobRoleId === n.jobRoleId, 'mudou_evento');
    for (const n of added) changes.push({ kind: 'entrou', eventId: n.eventId, jobRoleId: n.jobRoleId });
    for (const r of removed) changes.push({ kind: 'saiu', eventId: r.eventId, jobRoleId: r.jobRoleId });

    if (changes.length > 0) result.set(person, changes);
  }
  return result;
}
