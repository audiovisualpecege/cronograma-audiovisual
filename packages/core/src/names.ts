// Normalização e semelhança de nomes: unicidade dos cadastros e ligação dos nomes das planilhas.

/** Minúsculas, sem acentos e com espaços simples, como o unaccent(lower(name)) do banco. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palavras normalizadas, sem pontuação. */
export function nameTokens(s: string): string[] {
  return normalizeName(s)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

export function isNameTaken(name: string, existing: string[]): boolean {
  const n = normalizeName(name);
  return existing.some((e) => normalizeName(e) === n);
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] as number;
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length] as number;
}

// Semelhança de uma palavra digitada com uma do cadastro; abreviação ("P." de Pedro, "Fe" de Felipe) conta.
function tokenScore(raw: string, cand: string): number {
  if (raw === cand) return 1;
  if (cand.startsWith(raw)) return raw.length === 1 ? 0.75 : 0.85;
  const dist = levenshtein(raw, cand);
  return Math.max(0, 1 - dist / Math.max(raw.length, cand.length));
}

export interface NameMatch {
  name: string;
  id?: string;
  score: number;
}

/** Nota mínima para sugerir uma pessoa. */
export const NAME_MATCH_MIN = 0.5;

/**
 * Pessoas do cadastro mais parecidas com um nome lido, da maior para a menor nota (0 a 1).
 * Cada palavra lida casa com a melhor palavra do nome, em ordem; o primeiro nome pesa o dobro.
 */
export function matchName(raw: string, candidates: (string | { id: string; name: string })[]): NameMatch[] {
  const rt = nameTokens(raw);
  if (rt.length === 0) return [];
  const out: NameMatch[] = [];
  for (const c of candidates) {
    const name = typeof c === 'string' ? c : c.name;
    const ct = nameTokens(name);
    if (ct.length === 0) continue;
    let total = 0;
    let weight = 0;
    let from = 0;
    rt.forEach((t, i) => {
      const w = i === 0 ? 2 : 1;
      let best = 0;
      let bestAt = from;
      for (let j = i === 0 ? 0 : from; j < ct.length; j++) {
        const s = tokenScore(t, ct[j] as string);
        if (s > best) {
          best = s;
          bestAt = j;
        }
      }
      if (best > 0) from = bestAt + 1;
      total += best * w;
      weight += w;
    });
    // Primeiro nome diferente derruba a nota: "Ana" não é "Mariana".
    const first = tokenScore(rt[0] as string, ct[0] as string);
    const score = Math.round((total / weight) * (first < 0.5 ? 0.6 : 1) * 1000) / 1000;
    if (score >= NAME_MATCH_MIN) {
      out.push(typeof c === 'string' ? { name, score } : { name, id: c.id, score });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
