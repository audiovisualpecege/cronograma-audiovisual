// Antes da suíte: lê o Supabase local, grava a semente e entra uma vez com cada perfil usado nos testes.
// As sessões valem a suíte inteira; a semente recria as contas com os mesmos ids a cada teste.
import { createClient } from '@supabase/supabase-js';
import type { TestProject } from 'vitest/node';
import { resetDatabase } from './db.ts';
import { readSupabaseEnv, type SupabaseEnv } from './env.ts';
import { email, PASSWORD } from './ids.ts';

export const SIGNED_IN = [1, 2, 5, 10, 11] as const;

declare module 'vitest' {
  export interface ProvidedContext {
    supabase: SupabaseEnv;
    tokens: Record<string, string>;
  }
}

export default async function setup(project: TestProject) {
  const env = readSupabaseEnv();
  await resetDatabase(env.dbUrl);
  const tokens: Record<string, string> = {};
  for (const n of SIGNED_IN) {
    const client = createClient(env.apiUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: email(n), password: PASSWORD });
    if (error || !data.session) throw new Error(`Login de P${n} falhou: ${error?.message}`);
    tokens[`P${n}`] = data.session.access_token;
  }
  project.provide('supabase', env);
  project.provide('tokens', tokens);
}
