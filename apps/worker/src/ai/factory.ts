// Escolhe o fornecedor da IA pela configuração (settings.ai_provider): 'local' é o modelo na rede da empresa,
// qualquer outro valor é o Gemini.
import type { Clock } from '../clock.ts';
import { GeminiProvider } from './gemini.ts';
import { LocalProvider } from './local.ts';
import type { ProviderFactory } from './provider.ts';

export const providerFactory =
  (clock: Clock): ProviderFactory =>
  (opts) =>
    opts.provider === 'local'
      ? new LocalProvider({ url: opts.url ?? '', model: opts.model, key: opts.key || undefined })
      : new GeminiProvider({ key: opts.key, model: opts.model, clock });
