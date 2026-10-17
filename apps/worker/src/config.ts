import { existsSync, readFileSync } from 'node:fs';
import type { ServiceAccount } from './calendar/google.ts';

// Configuração do contêiner, lida do .env do NAS (veja apps/worker/.env.example).
export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Endereço do app web; o convite leva a `<appUrl>#/criar-senha`. */
  appUrl: string;
  googleServiceAccount: ServiceAccount | null;
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  logLevel: string;
  /** Consulta de reserva da fila, além do Realtime (ADR-006). */
  queuePollMs: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Variável ${name} ausente no .env do worker.`);
  return v;
}

function serviceAccountFrom(env: NodeJS.ProcessEnv): ServiceAccount | null {
  const inline = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const file = env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  // Arquivo ainda não colocado no NAS: o worker sobe sem a releitura das agendas e avisa no log.
  const raw = inline || (file && existsSync(file) ? readFileSync(file, 'utf8') : '');
  if (!raw) return null;
  const json = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!json.client_email || !json.private_key) {
    throw new Error('Conta de serviço do Google sem client_email ou private_key.');
  }
  return { client_email: json.client_email, private_key: json.private_key, token_uri: json.token_uri };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const vapidPublic = env.VAPID_PUBLIC_KEY?.trim();
  const vapidPrivate = env.VAPID_PRIVATE_KEY?.trim();
  return {
    supabaseUrl: required(env, 'SUPABASE_URL'),
    serviceRoleKey: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    appUrl: required(env, 'APP_URL'),
    googleServiceAccount: serviceAccountFrom(env),
    vapid:
      vapidPublic && vapidPrivate
        ? { publicKey: vapidPublic, privateKey: vapidPrivate, subject: env.VAPID_SUBJECT?.trim() || 'mailto:audiovisualpecege@gmail.com' }
        : null,
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    queuePollMs: Number(env.QUEUE_POLL_SECONDS ?? 30) * 1000,
  };
}
