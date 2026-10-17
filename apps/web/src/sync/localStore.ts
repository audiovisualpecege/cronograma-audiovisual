// Cópia local no IndexedDB (Dexie): uma tabela por tabela remota, a fila de envio, os conflitos, as recusas
// e o cursor de cada tabela (ADR-009). Um banco por pessoa, para um aparelho compartilhado não misturar dados.
import Dexie, { type Table } from 'dexie';
import { ADMIN_TABLES, type ConflictEntry, type Cursor, type OutboxEntry, type RejectionEntry, type Row, type TableName } from './types';

interface MetaEntry {
  key: string;
  value: unknown;
}

interface PendingRead {
  id: string;
  readAt: string;
}

// Índices extras das tabelas espelho, além de id e updated_at.
const MIRROR_INDEXES: Partial<Record<TableName, string>> = {
  events: 'week_start',
  slots: 'event_id',
  assignments: 'slot_id, event_id, person_id',
  published_assignments: 'week_id, person_id',
  person_roles: 'person_id',
  absences: 'person_id',
  notifications: 'created_at',
  service_type_crew: 'service_type_id',
  weeks: 'week_start',
};

export class LocalStore extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  conflicts!: Table<ConflictEntry, string>;
  rejections!: Table<RejectionEntry, string>;
  cursors!: Table<Cursor, string>;
  meta!: Table<MetaEntry, string>;
  pendingReads!: Table<PendingRead, string>;

  constructor(name: string) {
    super(name);
    const schema: Record<string, string> = {
      outbox: 'opId, createdAt',
      conflicts: 'opId',
      rejections: 'opId, rejectedAt',
      cursors: 'table',
      meta: 'key',
      pendingReads: 'id',
    };
    for (const table of ADMIN_TABLES) {
      const extra = MIRROR_INDEXES[table];
      schema[table] = extra ? `id, updated_at, ${extra}` : 'id, updated_at';
    }
    this.version(1).stores(schema);
  }

  mirror(table: TableName): Table<Row, string> {
    return this.table(table) as Table<Row, string>;
  }

  async getCursor(table: TableName): Promise<string | null> {
    return (await this.cursors.get(table))?.updatedAt ?? null;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }

  /** Fila em ordem de criação, como vai ao servidor. */
  pendingOps(): Promise<OutboxEntry[]> {
    return this.outbox.orderBy('createdAt').toArray();
  }
}

export function localStoreName(personId: string): string {
  return `cronograma-${personId}`;
}

export function openLocalStore(personId: string): LocalStore {
  return new LocalStore(localStoreName(personId));
}
