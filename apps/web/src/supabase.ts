// Fronteira com o Supabase. Só este arquivo conhece o supabase-js: o login e as ações "Precisa de internet"
// passam por aqui direto; as tabelas, só pelo SyncEngine (ADR-009). Nos testes, um Remote falso entra no lugar.
import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Op, OpResult, Row, TableName } from './sync/types';

export type Profile = 'admin' | 'team';

export interface Me {
  personId: string;
  name: string;
  profile: Profile;
}

export type SignInFailure = 'invalid_credentials' | 'rate_limited' | 'disabled' | 'offline' | 'unknown';

export type SignInResult =
  | { ok: true; me: Me }
  | { ok: false; reason: SignInFailure; retryAfterSeconds?: number; message?: string };

export type SimpleResult =
  | { ok: true }
  | { ok: false; reason: 'offline' | 'rate_limited' | 'invalid' | 'unknown'; message?: string; retryAfterSeconds?: number };

export type MeResult = { status: 'ok'; me: Me } | { status: 'disabled' } | { status: 'signed_out' } | { status: 'offline' };

/** Começo da próxima página na leitura incremental (paginação por chave updated_at, id). */
export interface PageAfter {
  updatedAt: string;
  id: string;
}

export class RemoteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly network = false,
  ) {
    super(message);
  }
}

export interface Remote {
  /** Há sessão guardada no aparelho (sem ir à rede). */
  hasStoredSession(): boolean;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<SimpleResult>;
  updatePassword(password: string): Promise<SimpleResult>;
  /** Adota a sessão que veio no link do e-mail (convite ou redefinição). */
  adoptSessionFromUrl(params: URLSearchParams): Promise<SimpleResult>;
  /** Avisa quando a sessão acaba (saída ou expiração sem renovação possível). */
  onSignedOut(cb: () => void): () => void;
  loadMe(): Promise<MeResult>;
  pullPage(table: TableName, cursor: string | null, after: PageAfter | null, limit: number): Promise<Row[]>;
  applyOps(ops: Op[]): Promise<OpResult[]>;
  markNotificationsRead(ids: string[], readAt: string): Promise<void>;
  /** Avisos do Realtime; `onLive` diz quando o canal está ouvindo (ou deixou de ouvir). */
  subscribe(tables: readonly TableName[], onChange: (table: TableName) => void, onLive?: (live: boolean) => void): () => void;
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
  /** Lê uma view inteira, em páginas (history_facts, que não entra na cópia local). Precisa de internet. */
  readView<T>(view: string, columns: string, order?: string[]): Promise<T[]>;
  /** Fecha o Realtime e a renovação da sessão (a sessão guardada continua). */
  close(): Promise<void>;
}

export const AUTH_STORAGE_KEY = 'cronograma-auth';

// O PostgREST do Supabase devolve no máximo 1.000 linhas por pedido.
const VIEW_PAGE = 1000;

export interface RemoteOptions {
  url: string;
  key: string;
  fetch?: typeof fetch;
  storage?: SupportedStorage;
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; status?: number };
  if (e.name === 'AuthRetryableFetchError') return true;
  return /failed to fetch|fetch failed|network|load failed/i.test(e.message ?? '');
}

export function createSupabaseRemote(options: RemoteOptions): Remote {
  const baseFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let lastRetryAfter: number | null = null;
  // O supabase-js não expõe os cabeçalhos do erro; o 429 do Auth traz o retry-after aqui.
  const trackingFetch: typeof fetch = async (input, init) => {
    const res = await baseFetch(input, init);
    if (res.status === 429) {
      const header = Number(res.headers.get('retry-after'));
      lastRetryAfter = Number.isFinite(header) && header > 0 ? header : null;
    }
    return res;
  };
  const storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);

  const client: SupabaseClient = createClient(options.url, options.key, {
    auth: {
      storage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // O link do e-mail chega como `#/criar-senha#access_token=...`: o app lê o fragmento (adoptSessionFromUrl).
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
    global: { fetch: trackingFetch },
  });

  async function loadMe(): Promise<MeResult> {
    const { data, error } = await client.auth.getSession();
    if (error) return isNetworkError(error) ? { status: 'offline' } : { status: 'signed_out' };
    const user = data.session?.user;
    if (!user) return { status: 'signed_out' };
    const res = await client.from('people').select('id, name, profile, active').eq('auth_user_id', user.id).maybeSingle();
    if (res.error) return isNetworkError(res.error) ? { status: 'offline' } : { status: 'disabled' };
    const row = res.data as { id: string; name: string; profile: Profile; active: boolean } | null;
    if (!row || !row.active) return { status: 'disabled' };
    return { status: 'ok', me: { personId: row.id, name: row.name, profile: row.profile } };
  }

  function failure(err: unknown): never {
    const e = err as { message?: string; details?: string; code?: string };
    if (isNetworkError(err)) throw new RemoteError('offline', 'Sem conexão com o servidor.', true);
    throw new RemoteError(e.message ?? 'unknown', e.details || e.message || 'Erro no servidor.');
  }

  return {
    hasStoredSession() {
      try {
        return Boolean(storage && (storage as Storage).getItem?.(AUTH_STORAGE_KEY));
      } catch {
        return false;
      }
    },

    async signIn(email, password) {
      lastRetryAfter = null;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        if (isNetworkError(error)) return { ok: false, reason: 'offline' };
        if (error.status === 429 || error.code === 'over_request_rate_limit') {
          return { ok: false, reason: 'rate_limited', retryAfterSeconds: lastRetryAfter ?? undefined };
        }
        if (error.code === 'user_banned') return { ok: false, reason: 'disabled' };
        if (error.code === 'invalid_credentials' || error.status === 400) return { ok: false, reason: 'invalid_credentials' };
        return { ok: false, reason: 'unknown', message: error.message };
      }
      const me = await loadMe();
      if (me.status === 'ok') return { ok: true, me: me.me };
      if (me.status === 'offline') return { ok: false, reason: 'offline' };
      await client.auth.signOut({ scope: 'local' });
      return { ok: false, reason: 'disabled' };
    },

    async signOut() {
      await client.auth.signOut({ scope: 'local' });
    },

    async requestPasswordReset(email, redirectTo) {
      lastRetryAfter = null;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (!error) return { ok: true };
      if (isNetworkError(error)) return { ok: false, reason: 'offline' };
      if (error.status === 429) return { ok: false, reason: 'rate_limited', retryAfterSeconds: lastRetryAfter ?? undefined };
      return { ok: false, reason: 'unknown', message: error.message };
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (!error) return { ok: true };
      if (isNetworkError(error)) return { ok: false, reason: 'offline' };
      if (error.code === 'weak_password' || error.code === 'same_password') {
        return { ok: false, reason: 'invalid', message: error.code };
      }
      return { ok: false, reason: 'unknown', message: error.message };
    },

    async adoptSessionFromUrl(params) {
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      if (!access || !refresh) return { ok: false, reason: 'invalid' };
      const { error } = await client.auth.setSession({ access_token: access, refresh_token: refresh });
      if (!error) return { ok: true };
      return { ok: false, reason: isNetworkError(error) ? 'offline' : 'invalid' };
    },

    onSignedOut(cb) {
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') cb();
      });
      return () => data.subscription.unsubscribe();
    },

    loadMe,

    async pullPage(table, cursor, after, limit) {
      let query = client.from(table).select('*');
      if (after) {
        query = query.or(`updated_at.gt."${after.updatedAt}",and(updated_at.eq."${after.updatedAt}",id.gt.${after.id})`);
      } else if (cursor) {
        query = query.gt('updated_at', cursor);
      }
      const { data, error } = await query.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
      if (error) failure(error);
      return (data ?? []) as Row[];
    },

    async applyOps(ops) {
      const { data, error } = await client.rpc('apply_ops', { ops });
      if (error) failure(error);
      return data as OpResult[];
    },

    async markNotificationsRead(ids, readAt) {
      if (ids.length === 0) return;
      const { error } = await client.from('notifications').update({ read_at: readAt }).in('id', ids);
      if (error) failure(error);
    },

    subscribe(tables, onChange, onLive) {
      const channel = client.channel(`sync-${Math.random().toString(36).slice(2)}`);
      for (const table of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
      }
      channel.subscribe((status) => onLive?.(status === 'SUBSCRIBED'));
      return () => {
        void client.removeChannel(channel);
      };
    },

    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(fn, args);
      if (error) failure(error);
      return data as T;
    },

    async readView<T>(view: string, columns: string, order: string[] = []) {
      const out: T[] = [];
      for (let from = 0; ; from += VIEW_PAGE) {
        let query = client.from(view).select(columns);
        // Ordem fixa para as páginas não repetirem nem pularem linhas.
        for (const col of order) query = query.order(col, { ascending: true, nullsFirst: true });
        const { data, error } = await query.range(from, from + VIEW_PAGE - 1);
        if (error) failure(error);
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < VIEW_PAGE) return out;
      }
    },

    async close() {
      await client.removeAllChannels();
      client.realtime.disconnect();
      await client.auth.stopAutoRefresh();
    },
  };
}

/** Remote do app, com a URL e a chave pública do build (nada secreto vai no build, ADR-008). */
export function createAppRemote(): Remote {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no build.');
  return createSupabaseRemote({ url, key });
}
