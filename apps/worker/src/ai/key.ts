// Chave da IA (US-016): fica em private.secrets, lida só aqui. A nova chega como `ai_key_pending` por set_ai_key
// e só vira `ai_key` depois de o fornecedor aceitá-la; recusada, a anterior continua valendo.
// O modelo local (settings.ai_provider = 'local') não usa chave: basta o endereço do servidor.
import { JobFailure, type JobResult } from '../queue.ts';
import type { AiKeyStore, SettingsRow, SettingsStore } from '../store.ts';
import type { AiProvider, ProviderFactory } from './provider.ts';

export const KEY_REFUSED = 'Chave recusada pelo fornecedor';
export const KEY_UNAVAILABLE = 'O fornecedor da IA não respondeu agora; a chave anterior continua valendo. Tente de novo mais tarde.';
export const LOCAL_NO_URL = 'Informe o endereço do servidor da IA local para testar.';
export const LOCAL_UNAVAILABLE =
  'O servidor da IA local não respondeu ou não tem o modelo configurado. Confira o endereço, o nome do modelo e se o servidor está ligado.';
export const DEFAULT_LOCAL_MODEL = 'minicpm5';

const isLocal = (s: SettingsRow) => s.ai_provider === 'local';

function localProvider(factory: ProviderFactory, s: SettingsRow): AiProvider | null {
  if (!s.ai_local_url) return null;
  return factory({ provider: 'local', model: s.ai_local_model || DEFAULT_LOCAL_MODEL, key: '', url: s.ai_local_url });
}

/**
 * Provedor em uso, ou nulo quando ainda não dá para usar (Gemini sem chave aprovada, local sem endereço).
 * O espaçamento entre chamadas (`wrap`) é para a cota do plano gratuito do Gemini; o local não tem cota.
 */
export function providerResolver(
  store: SettingsStore & { secret(name: string): Promise<string | null> },
  factory: ProviderFactory,
  wrap: (p: AiProvider) => AiProvider = (p) => p,
): () => Promise<AiProvider | null> {
  return async () => {
    const s = await store.settings();
    if (isLocal(s)) return localProvider(factory, s);
    const key = await store.secret('ai_key');
    if (!key) return null;
    return wrap(factory({ provider: s.ai_provider, model: s.ai_model, key }));
  };
}

export async function testAiKey(
  store: AiKeyStore,
  factory: ProviderFactory,
  payload: Record<string, unknown>,
): Promise<JobResult> {
  const s = await store.settings();
  if (isLocal(s)) {
    const provider = localProvider(factory, s);
    if (!provider) throw new JobFailure(LOCAL_NO_URL);
    const res = await provider.testKey('');
    if (res.ok) return { ok: true, message: 'Conexão testada: a IA local respondeu.' };
    throw new JobFailure(LOCAL_UNAVAILABLE, { ok: false, reason: res.reason });
  }
  const pending = await store.secret('ai_key_pending');
  const key = pending ?? (await store.secret('ai_key'));
  if (!key) throw new JobFailure('Informe a chave da IA para testar.');
  const provider = factory({ provider: typeof payload.provider === 'string' ? payload.provider : s.ai_provider, model: s.ai_model, key });
  const res = await provider.testKey(key);
  if (res.ok) {
    if (pending) await store.promoteAiKey(typeof payload.hint === 'string' ? payload.hint : null);
    return { ok: true, message: 'Chave testada: a IA respondeu.' };
  }
  if (pending) await store.dropPendingAiKey();
  throw new JobFailure(res.reason === 'invalid_key' ? KEY_REFUSED : KEY_UNAVAILABLE, { ok: false, reason: res.reason });
}
