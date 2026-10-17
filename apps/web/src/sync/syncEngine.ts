// Motor de sincronização (ADR-009): puxa cada tabela por cursor de updated_at, envia a fila em ordem de
// createdAt pela apply_ops com o mesmo opId em todo reenvio, trata applied, conflict e rejected, e ouve o
// Realtime só para disparar a leitura da tabela avisada. É a única porta de dados das telas.
import type { Table } from 'dexie';
import { RemoteError, type Profile, type Remote } from '../supabase';
import type { LocalStore } from './localStore';
import {
  ADMIN_TABLES,
  REALTIME_TABLES,
  TEAM_TABLES,
  type ConflictEntry,
  type Op,
  type OpKind,
  type OpResult,
  type OpTarget,
  type OutboxEntry,
  type RejectionEntry,
  type Row,
  type TableName,
} from './types';

export const PAGE_SIZE = 1000;
const BATCH_SIZE = 100;
/** Leitura de segurança das tabelas do Realtime: o servidor descarta avisos em rajadas (limite por segundo). */
export const SAFETY_PULL_MS = 30_000;

export interface SyncState {
  online: boolean;
  /** Operações guardadas no aparelho esperando envio (selo "a enviar"). */
  pending: number;
  /** Linhas com mudança na fila, como `tabela:id`. */
  pendingRows: ReadonlySet<string>;
  conflicts: readonly ConflictEntry[];
  rejections: readonly RejectionEntry[];
  /** Última leitura completa com o servidor (ISO). */
  lastSyncAt: string | null;
  /** Canal do Realtime ouvindo. */
  realtimeLive: boolean;
}

export interface SyncEngineOptions {
  store: LocalStore;
  remote: Remote;
  profile: Profile;
  online?: boolean;
  now?: () => Date;
  newId?: () => string;
  /** Intervalo da leitura de segurança; 0 desliga. */
  safetyPullMs?: number;
}

export interface EnqueueOptions {
  baseVersion?: number | null;
  target?: OpTarget;
}

export class OfflineError extends RemoteError {
  constructor() {
    super('offline', 'Precisa de internet.', true);
  }
}

const rowKey = (table: string, id: string) => `${table}:${id}`;

function isNetwork(err: unknown): boolean {
  return err instanceof RemoteError && err.network;
}

export class SyncEngine {
  readonly store: LocalStore;
  readonly remote: Remote;
  readonly tables: readonly TableName[];
  private readonly now: () => Date;
  private readonly newId: () => string;
  private state: SyncState;
  private readonly listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private flushAgain = false;
  private readonly pulls = new Map<TableName, Promise<number>>();
  private readonly pullAgain = new Set<TableName>();
  private unsubscribeRealtime: (() => void) | null = null;
  private lastCreatedAt = '';
  private started = false;
  private readonly safetyPullMs: number;
  private safetyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SyncEngineOptions) {
    this.store = options.store;
    this.remote = options.remote;
    this.tables = options.profile === 'admin' ? ADMIN_TABLES : TEAM_TABLES;
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.safetyPullMs = options.safetyPullMs ?? SAFETY_PULL_MS;
    this.state = {
      online: options.online ?? true,
      pending: 0,
      pendingRows: new Set(),
      conflicts: [],
      rejections: [],
      lastSyncAt: null,
      realtimeLive: false,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Estado para as telas (useSyncExternalStore)

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private async refreshState(): Promise<void> {
    if (this.store.hasBeenClosed()) return;
    const [outbox, conflicts, rejections, lastSyncAt] = await Promise.all([
      this.store.outbox.toArray(),
      this.store.conflicts.toArray(),
      this.store.rejections.orderBy('rejectedAt').toArray(),
      this.store.getMeta<string>('lastSyncAt'),
    ]);
    const pendingRows = new Set<string>();
    for (const op of [...outbox, ...conflicts.map((c) => c.op)]) {
      if (op.target) pendingRows.add(rowKey(op.target.table, op.target.id));
    }
    this.state = { ...this.state, pending: outbox.length, pendingRows, conflicts, rejections, lastSyncAt: lastSyncAt ?? null };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  // ---------------------------------------------------------------------------------------------
  // Ciclo de vida

  /** Abre a cópia local, ouve o Realtime e, com rede, envia a fila e puxa tudo. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const last = (await this.store.outbox.orderBy('createdAt').last())?.createdAt;
    if (last) this.lastCreatedAt = last;
    await this.refreshState();
    const realtime = REALTIME_TABLES.filter((t) => this.tables.includes(t));
    this.unsubscribeRealtime = this.remote.subscribe(
      realtime,
      (table) => void this.pull(table).catch(() => undefined),
      (live) => {
        const was = this.state.realtimeLive;
        this.state = { ...this.state, realtimeLive: live };
        this.emit();
        // Ao (re)conectar, lê o que mudou enquanto o canal estava fora.
        if (live && !was && this.state.online) {
          for (const table of realtime) void this.pull(table).catch(() => undefined);
        }
      },
    );
    if (this.safetyPullMs > 0) {
      // Avisos do Realtime podem se perder (limite de mensagens por segundo, queda do canal): a cada intervalo,
      // com rede e com a tela à vista, as mesmas tabelas são lidas pelo cursor (nada muda = resposta vazia).
      this.safetyTimer = setInterval(() => {
        if (!this.state.online || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
        for (const table of realtime) void this.pull(table).catch(() => undefined);
      }, this.safetyPullMs);
    }
    if (this.state.online) await this.sync();
  }

  stop(): void {
    this.started = false;
    if (this.safetyTimer) clearInterval(this.safetyTimer);
    this.safetyTimer = null;
    this.unsubscribeRealtime?.();
    this.unsubscribeRealtime = null;
    this.state = { ...this.state, realtimeLive: false };
  }

  setOnline(online: boolean): void {
    if (online === this.state.online) return;
    this.state = { ...this.state, online };
    this.emit();
    if (online && this.started) void this.sync().catch(() => undefined);
  }

  /** Envia a fila e depois puxa todas as tabelas; ao abrir e ao reconectar. */
  async sync(): Promise<void> {
    try {
      await this.flush();
      await this.flushReads();
      await this.pullAll();
    } catch (err) {
      if (!isNetwork(err)) throw err;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Enviar

  /** Guarda a edição na fila (e na linha local, na hora) e tenta enviar se houver rede. */
  async enqueue(kind: OpKind, payload: unknown, options: EnqueueOptions = {}): Promise<OutboxEntry> {
    let createdAt = this.now().toISOString();
    if (createdAt <= this.lastCreatedAt) createdAt = new Date(Date.parse(this.lastCreatedAt) + 1).toISOString();
    this.lastCreatedAt = createdAt;
    const entry: OutboxEntry = {
      opId: this.newId(),
      kind,
      payload,
      baseVersion: options.baseVersion ?? null,
      createdAt,
      target: options.target,
    };
    const target = options.target;
    const tables: Table[] = target ? [this.store.outbox, this.store.mirror(target.table)] : [this.store.outbox];
    await this.store.transaction('rw', tables, async () => {
      if (target) {
        const mirror = this.store.mirror(target.table);
        const before = (await mirror.get(target.id)) ?? null;
        entry.before = before;
        if (target.changes) {
          await mirror.put({ ...(before ?? { id: target.id, version: 0, updated_at: '' }), ...target.changes, id: target.id });
        }
      }
      await this.store.outbox.add(entry);
    });
    await this.refreshState();
    if (this.state.online) void this.flush().catch(() => undefined);
    return entry;
  }

  /** Envia a fila em lotes de até 100, em ordem de createdAt. Queda de rede deixa tudo na fila. */
  flush(): Promise<void> {
    if (!this.state.online) return Promise.resolve();
    if (this.flushing) {
      // Operação nova durante um envio: entra numa nova volta do mesmo envio.
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      do {
        this.flushAgain = false;
        await this.doFlush();
      } while (this.flushAgain && this.state.online);
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    const touched = new Set<TableName>();
    try {
      for (;;) {
        const batch = (await this.store.pendingOps()).slice(0, BATCH_SIZE);
        if (batch.length === 0) break;
        const ops: Op[] = batch.map(({ opId, kind, payload, baseVersion, createdAt }) => ({
          opId, kind, payload, baseVersion, createdAt,
        }));
        const results = await this.remote.applyOps(ops);
        const byId = new Map(results.map((r) => [r.opId, r]));
        let handled = 0;
        for (const entry of batch) {
          const result = byId.get(entry.opId);
          if (!result) continue;
          await this.handleResult(entry, result);
          handled += 1;
          if (entry.target) touched.add(entry.target.table);
        }
        if (batch.length < BATCH_SIZE || handled === 0) break;
      }
    } finally {
      await this.refreshState();
    }
    for (const table of touched) await this.pull(table).catch(() => undefined);
  }

  private async handleResult(entry: OutboxEntry, result: OpResult): Promise<void> {
    const target = entry.target;
    const tables: Table[] = [this.store.outbox, this.store.conflicts, this.store.rejections];
    if (target) tables.push(this.store.mirror(target.table));
    await this.store.transaction('rw', tables, async () => {
      await this.store.outbox.delete(entry.opId);
      if (result.status === 'applied') {
        if (target) await this.store.mirror(target.table).update(target.id, { version: result.version });
      } else if (result.status === 'conflict') {
        await this.store.conflicts.put({
          opId: entry.opId,
          op: entry,
          server: (result.server as Row | null) ?? null,
          local: result.local,
          detectedAt: this.now().toISOString(),
        });
      } else {
        await this.store.rejections.put({
          opId: entry.opId,
          kind: entry.kind,
          code: result.code,
          message: result.message,
          rejectedAt: this.now().toISOString(),
        });
        if (target && entry.before !== undefined) {
          const mirror = this.store.mirror(target.table);
          if (entry.before) await mirror.put(entry.before);
          else await mirror.delete(target.id);
        }
      }
    });
  }

  /** "Minha versão" reenvia a mesma operação sobre a versão do servidor; "versão do servidor" a descarta. */
  async resolveConflict(opId: string, choice: 'mine' | 'server'): Promise<void> {
    const conflict = await this.store.conflicts.get(opId);
    if (!conflict) return;
    const { op, server } = conflict;
    const tables: Table[] = [this.store.outbox, this.store.conflicts];
    if (op.target) tables.push(this.store.mirror(op.target.table));
    await this.store.transaction('rw', tables, async () => {
      await this.store.conflicts.delete(opId);
      if (choice === 'mine') {
        await this.store.outbox.put({ ...op, baseVersion: typeof server?.version === 'number' ? server.version : op.baseVersion });
      } else if (op.target && server) {
        await this.store.mirror(op.target.table).put(server);
      }
    });
    await this.refreshState();
    if (choice === 'mine') await this.flush().catch(() => undefined);
  }

  async dismissRejection(opId: string): Promise<void> {
    await this.store.rejections.delete(opId);
    await this.refreshState();
  }

  // ---------------------------------------------------------------------------------------------
  // Puxar

  /** Lê o que mudou na tabela desde o cursor e avança o cursor para o maior updated_at recebido. */
  pull(table: TableName): Promise<number> {
    if (!this.tables.includes(table)) return Promise.resolve(0);
    const running = this.pulls.get(table);
    if (running) {
      this.pullAgain.add(table);
      return running;
    }
    const p = this.doPull(table).finally(() => {
      this.pulls.delete(table);
      if (this.pullAgain.delete(table)) void this.pull(table).catch(() => undefined);
    });
    this.pulls.set(table, p);
    return p;
  }

  private async doPull(table: TableName): Promise<number> {
    const mirror = this.store.mirror(table);
    // Equipe: semana recém-publicada torna visíveis eventos com updated_at antigo, que o cursor não traria.
    const knownWeeks = table === 'weeks' && !this.tables.includes('slots') ? new Set(await mirror.toCollection().primaryKeys()) : null;
    let newWeek = false;
    let cursor = await this.store.getCursor(table);
    let after: { updatedAt: string; id: string } | null = null;
    let total = 0;
    for (;;) {
      const rows = await this.remote.pullPage(table, cursor, after, PAGE_SIZE);
      if (rows.length === 0) break;
      if (knownWeeks && rows.some((r) => !knownWeeks.has(r.id))) newWeek = true;
      const last = rows[rows.length - 1] as Row;
      await this.store.transaction('rw', [mirror, this.store.cursors, this.store.outbox], async () => {
        const pending = await this.pendingChanges(table);
        await mirror.bulkPut(rows.map((r) => (pending.has(r.id) ? { ...r, ...pending.get(r.id) } : r)));
        await this.store.cursors.put({ table, updatedAt: last.updated_at });
      });
      total += rows.length;
      cursor = last.updated_at;
      if (rows.length < PAGE_SIZE) break;
      after = { updatedAt: last.updated_at, id: last.id };
    }
    if (newWeek) {
      await this.store.cursors.delete('events');
      void this.pull('events').catch(() => undefined);
    }
    return total;
  }

  /** Mudanças ainda na fila, para a leitura não apagar o que o aparelho guardou e não enviou. */
  private async pendingChanges(table: TableName): Promise<Map<string, Record<string, unknown>>> {
    const out = new Map<string, Record<string, unknown>>();
    for (const op of await this.store.pendingOps()) {
      if (op.target?.table === table && op.target.changes) {
        out.set(op.target.id, { ...out.get(op.target.id), ...op.target.changes });
      }
    }
    return out;
  }

  async pullAll(): Promise<void> {
    for (const table of this.tables) await this.pull(table);
    await this.store.setMeta('lastSyncAt', this.now().toISOString());
    await this.refreshState();
  }

  // ---------------------------------------------------------------------------------------------
  // Avisos lidos: gravados na hora no aparelho e enviados ao servidor quando houver rede.

  async markNotificationsRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const readAt = this.now().toISOString();
    await this.store.transaction('rw', [this.store.mirror('notifications'), this.store.pendingReads], async () => {
      for (const id of ids) {
        await this.store.mirror('notifications').update(id, { read_at: readAt });
        await this.store.pendingReads.put({ id, readAt });
      }
    });
    if (this.state.online) await this.flushReads().catch(() => undefined);
  }

  private async flushReads(): Promise<void> {
    const pending = await this.store.pendingReads.toArray();
    const byTime = new Map<string, string[]>();
    for (const p of pending) byTime.set(p.readAt, [...(byTime.get(p.readAt) ?? []), p.id]);
    for (const [readAt, ids] of byTime) {
      await this.remote.markNotificationsRead(ids, readAt);
      await this.store.pendingReads.bulkDelete(ids);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Ações "Precisa de internet" (publicar, descartar, propor, reler, importar): direto no servidor.

  async runOnline<T>(action: (remote: Remote) => Promise<T>): Promise<T> {
    if (!this.state.online) throw new OfflineError();
    return action(this.remote);
  }
}
