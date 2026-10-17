// Serviço de fundo real dentro do processo dos testes de ponta a ponta, contra o Supabase local, com Google e
// Gemini simulados por msw a partir das gravações em fixtures/ (TechSpec, Testing Approach). O msw só pega as
// chamadas deste processo: o navegador fala direto com o Supabase.
import { createClient } from '@supabase/supabase-js';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { geminiFactory } from '../../apps/worker/src/ai/gemini.ts';
import { supabaseAuthApi } from '../../apps/worker/src/auth/admin.ts';
import { GoogleCalendar } from '../../apps/worker/src/calendar/google.ts';
import { clockFrom } from '../../apps/worker/src/clock.ts';
import { silentLogger } from '../../apps/worker/src/log.ts';
import { SupabaseStore } from '../../apps/worker/src/store.ts';
import { fixture, GeminiFake, GoogleFake, testServiceAccount } from '../../apps/worker/src/test/mocks.ts';
import { Worker } from '../../apps/worker/src/worker.ts';
import { e2eEnv } from './env.ts';

/** Mesmo relógio da semente: quarta 21/10/2026 12:00 em Brasília. */
export const NOW = '2026-10-21T12:00:00-03:00';
export const APP_URL = 'http://127.0.0.1:4173/cronograma-audiovisual/';
export const CALENDARS = { pecegeworks: 'pecegeworks@gmail.com', audiovisual: 'audiovisualpecege@gmail.com' };

export interface RunningWorker {
  google: GoogleFake;
  gemini: GeminiFake;
  stop(): Promise<void>;
}

/**
 * Sobe o worker; chaves em `refusedKeys` são recusadas pelo Gemini simulado (400 API_KEY_INVALID) e
 * `configure` ajusta os simuladores antes da primeira leitura.
 */
export async function startWorker(
  options: { refusedKeys?: string[]; configure?: (fakes: { google: GoogleFake; gemini: GeminiFake }) => void } = {},
): Promise<RunningWorker> {
  const env = e2eEnv();
  const google = new GoogleFake();
  google.list(CALENDARS.pecegeworks, 'google/week-b.json');
  google.list(CALENDARS.audiovisual, 'google/week-b-s2.json');
  const gemini = new GeminiFake();
  options.configure?.({ google, gemini });
  const refused = new Set(options.refusedKeys ?? []);
  const refuse = http.get(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/:?]+/, ({ request }) => {
    if (!refused.has(request.headers.get('x-goog-api-key') ?? '')) return undefined;
    return HttpResponse.json(fixture('gemini/error-400-invalid-key.json') as never, { status: 400 });
  });
  const server = setupServer(refuse, ...google.handlers(), ...gemini.handlers());
  server.listen({ onUnhandledFrame: 'bypass' });

  const db = createClient(env.apiUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const clock = clockFrom(new Date(NOW));
  const worker = new Worker({
    db,
    store: new SupabaseStore(db),
    clock,
    log: silentLogger(),
    version: '1.0.0',
    appUrl: APP_URL,
    google: new GoogleCalendar(testServiceAccount(), clock),
    providerFactory: geminiFactory(clock),
    pushSender: null,
    authApi: supabaseAuthApi(db),
    aiMinIntervalMs: 0,
    queuePollMs: 500,
  });
  await worker.start();
  return {
    google,
    gemini,
    async stop() {
      await worker.stop();
      server.close();
    },
  };
}
