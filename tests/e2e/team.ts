// Preparação dos testes da visão da equipe: consultas ao banco, escala direta (só para montar o cenário) e
// publicação como P1 pela RPC, com a sessão dele (o mesmo caminho do botão "Publicar").
import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';
import { withDb } from '../integration/helpers/db.ts';
import { person, role } from '../integration/helpers/ids.ts';
import { e2eEnv } from './env.ts';
import { email, login, PASSWORD } from './helpers';

export const db = <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
  withDb(e2eEnv().dbUrl, (c) => c.query<T>(text, params)).then((r) => r.rows);

/** Abre a rota, entra como P`who` e confere que voltou para a rota pedida. */
export async function openAs(page: Page, path: string, who: number) {
  await page.goto(`#${path}`);
  await login(page, email(who));
  await expect(page).toHaveURL(new RegExp(`#${path.replace(/[/?]/g, (c) => `\\${c}`)}$`));
}

/** A primeira vaga aberta da função no evento recebe a pessoa, confirmada. */
export async function assign(eventId: string, roleN: number, personN: number) {
  await db(
    `update public.assignments set person_id = $3, status = 'confirmed', decided_at = now()
     where id = (select a.id from public.assignments a join public.slots s on s.id = a.slot_id
                 where s.event_id = $1 and s.job_role_id = $2 and s.archived_at is null and a.person_id is null
                 order by s.id limit 1)`,
    [eventId, role(roleN), person(personN)],
  );
}

export async function publishAsP1(weekStart: string) {
  const env = e2eEnv();
  const client = createClient(env.apiUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: email(1), password: PASSWORD });
  if (error) throw error;
  const [week] = await db<{ id: string; revision: number }>('select id, revision from public.weeks where week_start = $1', [weekStart]);
  const res = await client.rpc('publish_week', { week_id: week?.id, expected_revision: week?.revision });
  if (res.error) throw res.error;
  await client.auth.signOut();
}
