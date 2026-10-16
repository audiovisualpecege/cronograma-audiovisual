// Clientes supabase-js por perfil (Administrador P1 e P2, Equipe P5, P10 e P11), sem sessão e service_role,
// mais atalhos para apply_ops, RPCs e consultas diretas ao banco.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type pg from 'pg';
import { beforeEach, inject } from 'vitest';
import { resetDatabase, withDb } from './db.ts';

const env = () => inject('supabase');

const options = (token?: string) => ({
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
});

/** Cliente com a sessão de P1, P2, P5, P10 ou P11. */
export function as(code: 'P1' | 'P2' | 'P5' | 'P10' | 'P11'): SupabaseClient {
  const token = inject('tokens')[code];
  if (!token) throw new Error(`Sem sessão para ${code}`);
  return createClient(env().apiUrl, env().publishableKey, options(token));
}

/** Só a chave pública, sem sessão. */
export const anon = () => createClient(env().apiUrl, env().publishableKey, options());

/** service_role, como o serviço de fundo. */
export const service = () => createClient(env().apiUrl, env().serviceRoleKey, options());

/** Semente nova antes de cada teste do arquivo. */
export function useSeed() {
  beforeEach(() => resetDatabase(env().dbUrl));
}

export function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  return withDb(env().dbUrl, fn);
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return db(async (c) => (await c.query(text, params)).rows as T[]);
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await sql<T>(text, params);
  if (rows.length !== 1) throw new Error(`Esperava 1 linha, veio ${rows.length}: ${text}`);
  return rows[0] as T;
}

export interface OpInput {
  kind: string;
  payload: Record<string, unknown>;
  baseVersion?: number | null;
  opId?: string;
}

export interface OpResult {
  opId: string;
  status: 'applied' | 'conflict' | 'rejected';
  version?: number;
  code?: string;
  message?: string;
  server?: Record<string, unknown>;
  local?: Record<string, unknown>;
  [k: string]: unknown;
}

export const op = (kind: string, payload: Record<string, unknown>, baseVersion: number | null = null): OpInput => ({
  kind,
  payload,
  baseVersion,
});

export async function applyOps(client: SupabaseClient, ops: OpInput[]): Promise<OpResult[]> {
  const body = ops.map((o) => ({
    opId: o.opId ?? randomUUID(),
    kind: o.kind,
    payload: o.payload,
    baseVersion: o.baseVersion ?? null,
    createdAt: new Date().toISOString(),
  }));
  const { data, error } = await client.rpc('apply_ops', { ops: body });
  if (error) throw new Error(`apply_ops: ${error.message} ${error.details ?? ''}`);
  return data as OpResult[];
}

export async function applyOne(client: SupabaseClient, o: OpInput): Promise<OpResult> {
  return (await applyOps(client, [o]))[0] as OpResult;
}

/** RPC que deve dar certo. */
export async function rpc<T = Record<string, unknown>>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message} ${error.details ?? ''}`);
  return data as T;
}

/** RPC que deve falhar: devolve o código (MESSAGE) e o texto para a pessoa (DETAIL). */
export async function rpcError(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args);
  if (!error) throw new Error(`${fn} deveria falhar e devolveu ${JSON.stringify(data)}`);
  return { code: error.message, detail: error.details, sqlstate: error.code };
}

/** Monta a semana B pelo administrador e devolve as vagas por evento e função. */
export async function buildWeekB() {
  const res = await rpc<{ week_id: string }>(as('P1'), 'build_week', { week_start: '2026-10-26' });
  return { weekId: res.week_id, slots: await slotsOfWeek('2026-10-26') };
}

/** Vagas ativas de uma semana como `{ [eventId]: { R1: [slotId...], ... } }`. */
export async function slotsOfWeek(weekStart: string) {
  const rows = await sql<{ event_id: string; code: string; id: string }>(
    `select s.event_id, r.code, s.id from public.slots s join public.events e on e.id = s.event_id
     join public.job_roles r on r.id = s.job_role_id
     where e.week_start = $1 and s.archived_at is null order by r.code, s.id`,
    [weekStart],
  );
  const out: Record<string, Record<string, string[]>> = {};
  for (const r of rows) ((out[r.event_id] ??= {})[r.code] ??= []).push(r.id);
  return out;
}

/** Primeira vaga ativa de uma função num evento. */
export async function slotOf(eventId: string, roleCode: string): Promise<string> {
  const row = await one<{ id: string }>(
    `select s.id from public.slots s join public.job_roles r on r.id = s.job_role_id
     where s.event_id = $1 and r.code = $2 and s.archived_at is null order by s.id limit 1`,
    [eventId, roleCode],
  );
  return row.id;
}

export async function assignmentOf(slotId: string) {
  return one<{ id: string; person_id: string | null; status: string | null; version: number; warnings: string[];
    override: boolean; locked: boolean; decided_by: string | null }>(
    'select * from public.assignments where slot_id = $1',
    [slotId],
  );
}
