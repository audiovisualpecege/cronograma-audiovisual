// Tipo de serviço dos eventos (ADR-012 item 5): palavra-chave (certeza alta), título parecido no histórico
// (média) e, se settings.ai_classification_enabled, a IA para o resto, em lotes de até 80 títulos.
// Certeza baixa deixa o tipo "a definir".
import { classifyTitle, weekStartOf } from '@cronograma/core';
import { errorMessage, type Logger } from '../log.ts';
import type { JobResult } from '../queue.ts';
import type { ClassifierStore, EventType } from '../store.ts';
import { AiError, type AiProvider } from './provider.ts';

export const CLASSIFY_BATCH = 80;

export interface ClassifyOutcome {
  types: Map<string, EventType>;
  aiCalls: number;
  aiQuotaHits: number;
}

export class Classifier {
  constructor(
    private store: ClassifierStore,
    private providerFor: () => Promise<AiProvider | null>,
    private log: Logger,
  ) {}

  async classify(items: { id: string; title: string }[]): Promise<ClassifyOutcome> {
    const out: ClassifyOutcome = { types: new Map(), aiCalls: 0, aiQuotaHits: 0 };
    if (items.length === 0) return out;
    const [types, history, settings] = await Promise.all([
      this.store.serviceTypes(),
      this.store.historyTitles(),
      this.store.settings(),
    ]);
    const byId = new Map(types.map((t) => [t.id, t]));
    const byCode = new Map(types.map((t) => [t.code, t]));
    const rest: { id: string; title: string }[] = [];
    for (const it of items) {
      const c = classifyTitle(it.title, types, history);
      const t = c.typeId ? byId.get(c.typeId) : undefined;
      out.types.set(it.id, { service_type_id: c.typeId, certainty: c.certainty, source: c.source, no_team: t?.no_team ?? false });
      if (!c.typeId) rest.push(it);
    }
    if (rest.length === 0 || !settings.ai_classification_enabled || types.length === 0) return out;
    const provider = await this.providerFor();
    if (!provider) return out;

    for (let i = 0; i < rest.length; i += CLASSIFY_BATCH) {
      const chunk = rest.slice(i, i + CLASSIFY_BATCH);
      // Ids curtos: a IA só vê o título do evento e os tipos cadastrados.
      const local = new Map(chunk.map((it, j) => [`E${j + 1}`, it.id]));
      try {
        out.aiCalls++;
        const answer = await provider.classify({
          items: chunk.map((it, j) => ({ id: `E${j + 1}`, title: it.title })),
          types: types.map((t) => ({ code: t.code, name: t.name })),
        });
        for (const a of answer) {
          const id = local.get(a.id);
          const t = a.type ? byCode.get(a.type) : undefined;
          if (!id || !t || a.certainty === 'baixa') continue;
          out.types.set(id, { service_type_id: t.id, certainty: 'media', source: 'ai', no_team: t.no_team });
        }
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        if (e.kind === 'quota') out.aiQuotaHits++;
        this.log.warn({ error: errorMessage(e), ai_calls: out.aiCalls }, 'classificação pela IA sem resposta; fica a definir');
        break;
      }
    }
    return out;
  }

  /** Job `classify`: eventos de agora em diante que ninguém classificou ainda. */
  async classifyPending(now: Date): Promise<JobResult> {
    const events = await this.store.unclassifiedEvents(weekStartOf(now));
    const res = await this.classify(events);
    let classified = 0;
    for (const [id, type] of res.types) {
      if (!type.service_type_id) continue;
      await this.store.setEventType(id, type);
      classified++;
    }
    return { events: events.length, classified, ai_calls: res.aiCalls, ai_quota_hits: res.aiQuotaHits };
  }
}
