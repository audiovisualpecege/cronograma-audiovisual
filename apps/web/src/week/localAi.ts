// IA deste computador (teste local): o app conversa direto com um servidor no formato da API de chat do OpenAI
// (Ollama com o MiniCPM5, por exemplo), sem Supabase nem serviço de fundo. Mesmas instruções, mesmos lotes de
// candidatos já conferidos e a mesma conferência de cada escolha que o serviço de fundo faz. O resultado vira
// sugestão na tela; nada é gravado antes de alguém aceitar. Só aparece rodando o app localmente (npm run dev).
import {
  buildProposalBatches,
  checkEligibility,
  PROPOSE_INSTRUCTION,
  PROPOSE_SCHEMA,
  type HistoryIndex,
  type ProposalBatch,
  type WeekContext,
} from '@cronograma/core';
import type { Draft } from './historyProposal';

export const LOCAL_AI_URL = import.meta.env.VITE_LOCAL_AI_URL || 'http://localhost:11434';
export const LOCAL_AI_MODEL = import.meta.env.VITE_LOCAL_AI_MODEL || 'minicpm5';
/** Vagas por chamada: um modelo de 2B acompanha melhor lotes pequenos (e cabe no contexto do Ollama). */
export const LOCAL_AI_BATCH = 10;

/** O JSON da resposta, sem o raciocínio <think> nem a cerca ```json que modelos pequenos às vezes põem. */
export function extractJson(text: string): unknown {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.search(/[[{]/);
    const end = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'));
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error('a IA devolveu um texto que não é JSON');
  }
}

/** Vagas da resposta: aproveita os itens no formato e ignora os tortos. */
export function answerItems(x: unknown): { slot: string; person: string | null; reason: string }[] {
  const list = Array.isArray(x) ? x : x && typeof x === 'object' && Array.isArray((x as { items?: unknown }).items) ? (x as { items: unknown[] }).items : null;
  if (!list) throw new Error('a IA não devolveu uma lista de vagas');
  return list.flatMap((it) => {
    if (!it || typeof it !== 'object') return [];
    const o = it as Record<string, unknown>;
    if (typeof o.slot !== 'string') return [];
    const person = typeof o.person === 'string' && o.person.trim() ? o.person.trim() : null;
    return [{ slot: o.slot, person, reason: typeof o.reason === 'string' ? o.reason : '' }];
  });
}

async function ask(batch: ProposalBatch, signal: AbortSignal): Promise<ReturnType<typeof answerItems>> {
  const base = LOCAL_AI_URL.replace(/\/+$/, '').replace(/\/v1$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: LOCAL_AI_MODEL,
        temperature: 0.2,
        stream: false,
        messages: [
          { role: 'system', content: `${PROPOSE_INSTRUCTION} Responda só com JSON no formato { "items": [...] }, sem texto antes ou depois.` },
          { role: 'user', content: JSON.stringify({ slots: batch.slots, people: batch.people }) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'resposta', schema: { type: 'object', properties: { items: PROPOSE_SCHEMA }, required: ['items'] } } },
      }),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new Error(`sem conexão com a IA deste computador em ${LOCAL_AI_URL}. O Ollama está aberto?`, { cause: e });
  }
  if (!res.ok) {
    const why = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`a IA recusou o pedido (${res.status})${why ? `: ${why}` : ''}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return answerItems(extractJson(body.choices?.[0]?.message?.content ?? ''));
}

export interface LocalAiProgress {
  batch: number;
  /** Total estimado de lotes (as vagas recusadas saem dos lotes seguintes). */
  total: number;
  drafts: ReadonlyMap<string, Draft>;
  errors: string[];
}

/**
 * Pede a escala à IA deste computador, lote a lote, e devolve as sugestões conferidas (função, horário, ausência
 * e limite, contando as escolhas anteriores). onProgress recebe o parcial a cada lote, para a tela ir mostrando.
 */
export async function proposeWithLocalAi(
  ctx: WeekContext,
  history: HistoryIndex,
  onProgress: (p: LocalAiProgress) => void,
  signal: AbortSignal,
): Promise<LocalAiProgress> {
  const work: WeekContext = { ...ctx, assignments: ctx.assignments.filter((a) => a.status === 'confirmed' || a.locked) };
  const drafts = new Map<string, Draft>();
  const errors: string[] = [];
  const skipped = new Set<string>();
  const byCode = new Map(ctx.people.map((p) => [p.code, p.id]));
  const slotByCode = new Map(ctx.slots.map((s) => [s.code, s]));
  const total = buildProposalBatches(work, history, { batchSize: LOCAL_AI_BATCH }).length;
  for (let index = 0; !signal.aborted; index++) {
    const view = { ...work, slots: work.slots.filter((s) => !skipped.has(s.id) && !drafts.has(s.id)) };
    const prior = [...drafts].map(([slotId, d]) => ({ slotId, personId: d.personId }));
    const batch = buildProposalBatches(view, history, { batchSize: LOCAL_AI_BATCH, prior })[0];
    if (!batch) break;
    try {
      const answer = await ask(batch, signal);
      for (const s of batch.slots) {
        const slot = slotByCode.get(s.slot);
        const a = answer.find((x) => x.slot === s.slot);
        const personId = a?.person ? byCode.get(a.person) : undefined;
        if (slot && personId && checkEligibility(personId, slot.id, work).ok) {
          work.assignments.push({ slotId: slot.id, eventId: slot.eventId, personId, status: 'proposed', locked: false });
          drafts.set(slot.id, { personId, reason: `IA: ${a?.reason.trim() || 'escolha da IA'}` });
        } else if (slot) {
          skipped.add(slot.id);
        }
      }
    } catch (e) {
      if (signal.aborted) break;
      errors.push(e instanceof Error ? e.message : String(e));
      for (const s of batch.slots) {
        const slot = slotByCode.get(s.slot);
        if (slot) skipped.add(slot.id);
      }
      // Sem conexão: não adianta tentar os outros lotes.
      if (/sem conexão/.test(errors.at(-1) ?? '')) break;
    }
    onProgress({ batch: index + 1, total, drafts: new Map(drafts), errors: [...errors] });
  }
  return { batch: total, total, drafts, errors };
}
