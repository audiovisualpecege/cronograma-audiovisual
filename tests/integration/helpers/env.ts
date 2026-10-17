// Endereço e chaves do Supabase local. Vêm das variáveis de ambiente ou de `supabase status`.
import { execSync } from 'node:child_process';

export interface SupabaseEnv {
  apiUrl: string;
  dbUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  /** Caixa de e-mail local do Auth (Mailpit, antigo Inbucket). */
  mailUrl: string;
}

export function readSupabaseEnv(): SupabaseEnv {
  const fromEnv = {
    apiUrl: process.env.SUPABASE_URL,
    dbUrl: process.env.SUPABASE_DB_URL,
    publishableKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    mailUrl: process.env.MAILPIT_URL ?? process.env.INBUCKET_URL,
  };
  if (fromEnv.apiUrl && fromEnv.dbUrl && fromEnv.publishableKey && fromEnv.serviceRoleKey && fromEnv.mailUrl) {
    return fromEnv as SupabaseEnv;
  }
  let raw: string;
  try {
    raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('Supabase local fora do ar: rode `npx supabase start` antes de `npm run test:integration`.');
  }
  const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>;
  return {
    apiUrl: status.API_URL as string,
    dbUrl: status.DB_URL as string,
    publishableKey: (status.PUBLISHABLE_KEY ?? status.ANON_KEY) as string,
    serviceRoleKey: status.SERVICE_ROLE_KEY as string,
    mailUrl: (status.MAILPIT_URL ?? status.INBUCKET_URL) as string,
  };
}
