// Chave da IA (US-016): fica em private.secrets, lida só aqui. A nova chega como `ai_key_pending` por set_ai_key
// e só vira `ai_key` depois de o fornecedor aceitá-la; recusada, a anterior continua valendo.
import { JobFailure, type JobResult } from '../queue.ts';
import type { AiKeyStore, SettingsStore } from '../store.ts';
import type { AiProvider, ProviderFactory } from './provider.ts';

export const KEY_REFUSED = 'Chave recusada pelo fornecedor';
export const KEY_UNAVAILABLE = 'O fornecedor da IA não respondeu agora; a chave anterior continua valendo. Tente de novo mais tarde.';

/** Provedor com a chave em uso, ou nulo quando ainda não há chave aprovada. */
export function providerResolver(
  store: SettingsStore & { secret(name: string): Promise<string | null> },
  factory: ProviderFactory,
  wrap: (p: AiProvider) => AiProvider = (p) => p,
): () => Promise<AiProvider | null> {
  return async () => {
    const key = await store.secret('ai_key');
    if (!key) return null;
    const s = await store.settings();
    return wrap(factory({ provider: s.ai_provider, model: s.ai_model, key }));
  };
}

export async function testAiKey(
  store: AiKeyStore,
  factory: ProviderFactory,
  payload: Record<string, unknown>,
): Promise<JobResult> {
  const pending = await store.secret('ai_key_pending');
  const key = pending ?? (await store.secret('ai_key'));
  if (!key) throw new JobFailure('Informe a chave da IA para testar.');
  const s = await store.settings();
  const provider = factory({ provider: typeof payload.provider === 'string' ? payload.provider : s.ai_provider, model: s.ai_model, key });
  const res = await provider.testKey(key);
  if (res.ok) {
    if (pending) await store.promoteAiKey(typeof payload.hint === 'string' ? payload.hint : null);
    return { ok: true, message: 'Chave testada: a IA respondeu.' };
  }
  if (pending) await store.dropPendingAiKey();
  throw new JobFailure(res.reason === 'invalid_key' ? KEY_REFUSED : KEY_UNAVAILABLE, { ok: false, reason: res.reason });
}
