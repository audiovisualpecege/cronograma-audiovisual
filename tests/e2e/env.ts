// Endereços do Supabase local para os testes de ponta a ponta, mais o Mailpit (o "Inbucket" do Supabase).
import { execSync } from 'node:child_process';
import { readSupabaseEnv, type SupabaseEnv } from '../integration/helpers/env.ts';

/** Chave pública VAPID usada só no build dos testes de ponta a ponta. */
export const E2E_VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

export interface E2eEnv extends SupabaseEnv {
  mailUrl: string;
}

let cached: E2eEnv | null = null;

export function e2eEnv(): E2eEnv {
  if (cached) return cached;
  const base = readSupabaseEnv();
  let mailUrl = process.env.SUPABASE_MAIL_URL;
  if (!mailUrl) {
    try {
      const raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>;
      mailUrl = status.MAILPIT_URL ?? status.INBUCKET_URL;
    } catch {
      mailUrl = undefined;
    }
  }
  cached = { ...base, mailUrl: mailUrl ?? 'http://127.0.0.1:55324' };
  return cached;
}
