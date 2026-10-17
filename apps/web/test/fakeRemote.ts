// Supabase falso só na fronteira de rede (TechSpec, Testing Approach): o app inteiro roda de verdade por cima.
import { RemoteError, type Me, type MeResult, type PageAfter, type Remote, type SignInResult, type SimpleResult } from '../src/supabase';
import type { Op, OpResult, Row, TableName } from '../src/sync/types';

export const ADMIN_ME: Me = { personId: 'd0000000-0000-4000-8000-000000000001', name: 'Pessoa Exemplo 01', profile: 'admin' };
export const TEAM_ME: Me = { personId: 'd0000000-0000-4000-8000-000000000010', name: 'Pessoa Exemplo 10', profile: 'team' };

/** Endereço do projeto Supabase falso. */
export const FAKE_URL = 'https://projeto.supabase.test';

export interface PullCall {
  table: TableName;
  cursor: string | null;
  after: PageAfter | null;
  limit: number;
}

export class FakeRemote implements Remote {
  storedSession = false;
  me: Me | null = null;
  signInResult: SignInResult | null = null;
  offline = false;
  rows: Partial<Record<TableName, Row[]>> = {};
  pullCalls: PullCall[] = [];
  applyCalls: Op[][] = [];
  readCalls: { ids: string[]; readAt: string }[] = [];
  resetCalls: { email: string; redirectTo: string }[] = [];
  rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  /** Resposta das RPCs; o padrão devolve um objeto vazio. */
  rpcHandler: (fn: string, args: Record<string, unknown>) => unknown = () => ({});
  views: Record<string, object[]> = {};
  viewCalls: string[] = [];
  applyHandler: (ops: Op[]) => OpResult[] | Promise<OpResult[]> = (ops) =>
    ops.map((op) => ({ opId: op.opId, status: 'applied', version: (op.baseVersion ?? 0) + 1 }));
  private realtime = new Map<TableName, (table: TableName) => void>();
  private signedOut = new Set<() => void>();

  private network(): void {
    if (this.offline) throw new RemoteError('offline', 'Sem conexão com o servidor.', true);
  }

  hasStoredSession() {
    return this.storedSession;
  }

  async signIn(): Promise<SignInResult> {
    if (this.offline) return { ok: false, reason: 'offline' };
    const result = this.signInResult ?? (this.me ? { ok: true as const, me: this.me } : { ok: false as const, reason: 'invalid_credentials' as const });
    if (result.ok) this.storedSession = true;
    return result;
  }

  async signOut() {
    this.storedSession = false;
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<SimpleResult> {
    this.resetCalls.push({ email, redirectTo });
    return this.offline ? { ok: false, reason: 'offline' } : { ok: true };
  }

  async updatePassword(): Promise<SimpleResult> {
    return { ok: true };
  }

  async adoptSessionFromUrl(params: URLSearchParams): Promise<SimpleResult> {
    if (!params.get('access_token')) return { ok: false, reason: 'invalid' };
    this.storedSession = true;
    return { ok: true };
  }

  onSignedOut(cb: () => void) {
    this.signedOut.add(cb);
    return () => this.signedOut.delete(cb);
  }

  /** Simula a sessão vencida sem renovação possível (US-001 EC-5). */
  expireSession() {
    this.storedSession = false;
    for (const cb of this.signedOut) cb();
  }

  async loadMe(): Promise<MeResult> {
    if (this.offline) return { status: 'offline' };
    if (!this.storedSession) return { status: 'signed_out' };
    return this.me ? { status: 'ok', me: this.me } : { status: 'disabled' };
  }

  async pullPage(table: TableName, cursor: string | null, after: PageAfter | null, limit: number): Promise<Row[]> {
    this.pullCalls.push({ table, cursor, after, limit });
    this.network();
    return (this.rows[table] ?? [])
      .filter((r) => {
        if (after) return r.updated_at > after.updatedAt || (r.updated_at === after.updatedAt && r.id > after.id);
        return cursor === null || r.updated_at > cursor;
      })
      .sort((a, b) => (a.updated_at === b.updated_at ? a.id.localeCompare(b.id) : a.updated_at.localeCompare(b.updated_at)))
      .slice(0, limit);
  }

  async applyOps(ops: Op[]): Promise<OpResult[]> {
    this.applyCalls.push(ops.map((o) => ({ ...o })));
    this.network();
    return this.applyHandler(ops);
  }

  async markNotificationsRead(ids: string[], readAt: string) {
    this.network();
    this.readCalls.push({ ids, readAt });
  }

  subscribe(tables: readonly TableName[], onChange: (table: TableName) => void) {
    for (const t of tables) this.realtime.set(t, onChange);
    return () => {
      for (const t of tables) this.realtime.delete(t);
    };
  }

  /** Evento do Realtime numa tabela. */
  emit(table: TableName) {
    this.realtime.get(table)?.(table);
  }

  subscribedTables(): TableName[] {
    return [...this.realtime.keys()];
  }

  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    this.network();
    this.rpcCalls.push({ fn, args });
    return (await this.rpcHandler(fn, args)) as T;
  }

  async readView<T>(view: string): Promise<T[]> {
    this.network();
    this.viewCalls.push(view);
    return (this.views[view] ?? []) as T[];
  }

  publicUrl(path: string) {
    return `${FAKE_URL}${path}`;
  }

  async close() {
    this.realtime.clear();
  }
}

/** Armazenamento em memória para a sessão do supabase-js nos testes. */
export function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

/** `fetch` falso: a fronteira de rede do supabase-js real. */
export function fakeFetch(handler: (req: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req.clone());
    return handler(req);
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01', ...headers },
  });
}

/** Sessão do Auth no formato do GoTrue, com um JWT sem assinatura válida (o cliente não confere). */
export function tokenResponse(userId: string, email: string) {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, email, role: 'authenticated', exp })}.assinatura`;
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'refresh-token',
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
}
