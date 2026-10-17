// Worker real contra o Supabase local, com Google, Gemini e Web Push simulados por msw a partir das gravações
// em fixtures/. O relógio do worker começa na quarta 21/10/2026 12:00, o mesmo da semente.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, inject } from 'vitest';
import { geminiFactory } from '../../../apps/worker/src/ai/gemini.ts';
import { supabaseAuthApi } from '../../../apps/worker/src/auth/admin.ts';
import { GoogleCalendar } from '../../../apps/worker/src/calendar/google.ts';
import { clockFrom } from '../../../apps/worker/src/clock.ts';
import { createLogger, silentLogger } from '../../../apps/worker/src/log.ts';
import { webPushSender } from '../../../apps/worker/src/push/notifier.ts';
import type { JobKind } from '../../../apps/worker/src/store.ts';
import { SupabaseStore } from '../../../apps/worker/src/store.ts';
import {
  GeminiFake, GoogleFake, PushFake, TEST_VAPID, testServiceAccount,
} from '../../../apps/worker/src/test/mocks.ts';
import { Worker } from '../../../apps/worker/src/worker.ts';
import { one, service, sql } from '../helpers/supabase.ts';

export const NOW = '2026-10-21T12:00:00-03:00';
export const APP_URL = 'http://127.0.0.1:3000/';
export const S1 = { id: 'f0000000-0000-4000-8000-000000000001', cal: 'pecegeworks@gmail.com' };
export const S2 = { id: 'f0000000-0000-4000-8000-000000000002', cal: 'audiovisualpecege@gmail.com' };
export const AI_KEY = 'AIzaSyTESTE-chave-em-uso-0000';

export const google = new GoogleFake();
export const gemini = new GeminiFake();
export const push = new PushFake();

/** Registra os simuladores, uma semente nova (via useSeed) e um worker novo antes de cada teste. */
export function useWorker() {
  const server = setupServer();
  const ctx = { worker: null as unknown as Worker, store: null as unknown as SupabaseStore };
  beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
  afterAll(() => server.close());
  beforeEach(() => {
    google.calls = [];
    google.lists.clear();
    google.events.clear();
    google.calendars.clear();
    google.list(S1.cal, 'google/week-b.json');
    google.list(S2.cal, 'google/week-b-s2.json');
    gemini.requests = [];
    gemini.modelRequests = [];
    gemini.queue = [];
    push.received = [];
    push.status.clear();
    server.resetHandlers(...google.handlers(), ...gemini.handlers(), ...push.handlers());
    const db = service();
    const clock = clockFrom(new Date(NOW));
    ctx.store = new SupabaseStore(db);
    ctx.worker = new Worker({
      db,
      store: ctx.store,
      clock,
      // WORKER_TEST_LOG=warn mostra os logs do worker durante os testes.
      log: process.env.WORKER_TEST_LOG ? createLogger(process.env.WORKER_TEST_LOG) : silentLogger(),
      version: '1.0.0',
      appUrl: APP_URL,
      google: new GoogleCalendar(testServiceAccount(), clock),
      providerFactory: geminiFactory(clock),
      pushSender: webPushSender(TEST_VAPID),
      authApi: supabaseAuthApi(db),
      aiMinIntervalMs: 0,
      queuePollMs: 500,
    });
  });
  afterEach(async () => {
    await ctx.worker.stop();
  });
  return ctx;
}

export async function enqueue(kind: JobKind, payload: Record<string, unknown> = {}, dedupe: string | null = null): Promise<string> {
  return (await one<{ id: string }>('select public.enqueue_job($1, $2, $3, null) as id', [kind, payload, dedupe])).id;
}

export async function job(id: string) {
  return one<{ status: string; result: Record<string, unknown> | null; error: string | null }>(
    'select status, result, error from public.jobs where id = $1', [id],
  );
}

/** Pede o job e deixa a fila do worker rodar até o fim. */
export async function runJob(worker: Worker, kind: JobKind, payload: Record<string, unknown> = {}, dedupe: string | null = null) {
  const id = await enqueue(kind, payload, dedupe);
  await worker.queue.drain();
  return { id, ...(await job(id)) };
}

export async function setAiKey(key = AI_KEY) {
  await sql("select public.set_secret('ai_key', $1)", [key]);
}

export const notificationsOf = (personCode: number, kind?: string) =>
  sql<{ id: string; kind: string; title: string; body: string; dedupe_key: string; link: string; pushed_at: string | null }>(
    `select n.* from public.notifications n join public.people p on p.id = n.person_id
     where p.code = $1 and ($2::text is null or n.kind = $2) order by n.created_at, n.id`,
    [`P${personCode}`, kind ?? null],
  );

export async function until<T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Tempo esgotado esperando: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Caixa de e-mail local do Auth (Mailpit).
const mail = () => inject('supabase').mailUrl;

export async function clearMail() {
  await fetch(`${mail()}/api/v1/messages`, { method: 'DELETE' });
}

export async function mailTo(address: string): Promise<{ subject: string; text: string; html: string }[]> {
  const res = await fetch(`${mail()}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
  const out = [];
  for (const m of messages ?? []) {
    const full = (await (await fetch(`${mail()}/api/v1/message/${m.ID}`)).json()) as { Text: string; HTML: string };
    out.push({ subject: m.Subject, text: full.Text, html: full.HTML });
  }
  return out;
}
