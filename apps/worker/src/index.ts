// Partida do contêiner no NAS: lê o .env, conecta ao Supabase com a service_role e sobe o worker.
import { createClient } from '@supabase/supabase-js';
import { providerFactory } from './ai/factory.ts';
import { supabaseAuthApi } from './auth/admin.ts';
import { GoogleCalendar } from './calendar/google.ts';
import { systemClock } from './clock.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './log.ts';
import { webPushSender } from './push/notifier.ts';
import { SupabaseStore } from './store.ts';
import { readAppVersion } from './version.ts';
import { Worker } from './worker.ts';

const config = loadConfig();
const log = createLogger(config.logLevel);
const version = readAppVersion();
const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
if (!config.googleServiceAccount) log.warn('sem conta de serviço do Google: a releitura das agendas fica parada');
if (!config.vapid) log.warn('sem chaves VAPID: os avisos ficam só dentro da plataforma');

const worker = new Worker({
  db,
  store: new SupabaseStore(db),
  clock: systemClock,
  log,
  version,
  appUrl: config.appUrl,
  google: config.googleServiceAccount ? new GoogleCalendar(config.googleServiceAccount, systemClock) : null,
  providerFactory: providerFactory(systemClock),
  aiLocal: config.aiLocal,
  pushSender: config.vapid ? webPushSender(config.vapid) : null,
  authApi: supabaseAuthApi(db),
  queuePollMs: config.queuePollMs,
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info({ signal, version }, 'serviço de fundo parando');
    void worker.stop().finally(() => process.exit(0));
  });
}

worker.start().catch((e: unknown) => {
  log.fatal({ err: e, version }, 'serviço de fundo não subiu');
  process.exit(1);
});
