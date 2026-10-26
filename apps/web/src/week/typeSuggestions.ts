// Tipo de serviço sugerido para os eventos ainda sem tipo: palavra-chave do cadastro primeiro, depois o título
// mais parecido do histórico.
import { classifyTitle, jaccard, JACCARD_MIN, titleWords } from '@cronograma/core';
import type { HistoryFactRow, ServiceTypeRow } from '../data/catalog';
import type { WeekRows } from './model';

export interface TitleWords {
  words: Set<string>;
  typeId: string;
}

/**
 * Palavras de cada título do histórico, uma vez por título. Feito uma vez só quando o histórico chega: são
 * dezenas de milhares de linhas, e refazer isso a cada clique travava a tela.
 */
export function buildTitleIndex(history: readonly HistoryFactRow[] | null): TitleWords[] {
  const seen = new Set<string>();
  const out: TitleWords[] = [];
  for (const h of history ?? []) {
    if (!h.service_type_id || !h.title) continue;
    const key = `${h.service_type_id}|${h.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ words: titleWords(h.title), typeId: h.service_type_id });
  }
  return out;
}

/** Tipo sugerido para cada evento ainda sem tipo: palavra-chave primeiro, depois o título mais parecido do histórico. */
export function typeSuggestions(rows: WeekRows, index: readonly TitleWords[]): Map<string, ServiceTypeRow> {
  const out = new Map<string, ServiceTypeRow>();
  const missing = rows.events.filter((e) => !e.ignored && e.status !== 'cancelled' && !e.service_type_id);
  if (missing.length === 0) return out;
  const types = rows.types.filter((t) => !t.archived_at);
  const byId = new Map(types.map((t) => [t.id, t]));
  const like = types.map((t) => ({ id: t.id, code: t.code, keywords: t.keywords ?? [] }));
  for (const e of missing) {
    const c = classifyTitle(e.title, like, []);
    let typeId = c.typeId;
    if (!typeId) {
      const target = titleWords(e.title);
      let best = 0;
      for (const h of index) {
        if (!byId.has(h.typeId)) continue;
        const score = jaccard(target, h.words);
        if (score > best) {
          best = score;
          typeId = h.typeId;
        }
      }
      if (best < JACCARD_MIN) typeId = null;
    }
    const type = typeId ? byId.get(typeId) : undefined;
    if (type) out.set(e.id, type);
  }
  return out;
}
