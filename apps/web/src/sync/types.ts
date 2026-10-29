// Porta de dados do app (TechSpec, Core Interfaces). As telas só leem e gravam pelo SyncEngine.

export type OpKind =
  | 'person.upsert' | 'person.deactivate' | 'person.reactivate' | 'absence.upsert' | 'absence.archive'
  | 'sector.upsert' | 'sector.archive' | 'calendar_source.upsert' | 'calendar_source.remove'
  | 'job_role.upsert' | 'job_role.archive' | 'service_type.upsert' | 'service_type.archive'
  | 'event.update_extras' | 'event.internal_upsert' | 'event.internal_cancel' | 'event.mark_reviewed'
  | 'event.resolve_duplicate' | 'week.build' | 'slot.add' | 'slot.remove'
  | 'assignment.set' | 'assignment.clear' | 'assignment.lock' | 'assignment.accept' | 'assignment.discard'
  | 'settings.update';

export interface Op { opId: string; kind: OpKind; payload: unknown; baseVersion: number | null; createdAt: string }

export type OpResult =
  | { opId: string; status: 'applied'; version: number }
  | { opId: string; status: 'conflict'; server: unknown; local: unknown }
  | { opId: string; status: 'rejected'; code: string; message: string };

/** Linha de qualquer tabela espelhada: toda tabela pública tem id, version e updated_at. */
export interface Row {
  id: string;
  version: number;
  updated_at: string;
  [column: string]: unknown;
}

/**
 * Tabelas que a cópia local espelha. A RLS decide o que cada perfil recebe. A equipe lê os tipos de serviço
 * (migração 0019) para saber de que setor é cada reunião; antes dela, a leitura volta vazia.
 */
export const TEAM_TABLES = [
  'sectors', 'job_roles', 'people', 'people_public', 'person_roles', 'weeks', 'events',
  'published_assignments', 'absences', 'notifications', 'service_types',
] as const;

export const ADMIN_TABLES = [
  ...TEAM_TABLES,
  'service_type_crew', 'calendar_sources', 'slots', 'assignments', 'publications', 'jobs',
  'settings', 'series_rules',
] as const;

export type TableName = (typeof ADMIN_TABLES)[number];

/**
 * Tabelas de migração que pode ainda não estar no banco (series_rules, da 0020): a leitura recusada fica vazia
 * em vez de parar a sincronização.
 */
export const OPTIONAL_TABLES: readonly TableName[] = ['series_rules'];

/** Tabelas com aviso pelo Realtime (migrações 0008 e 0010); o aviso só dispara a leitura incremental. */
export const REALTIME_TABLES: readonly TableName[] = [
  'notifications', 'events', 'weeks', 'published_assignments', 'assignments', 'slots', 'jobs',
  'calendar_sources', 'settings',
];

/** Onde a mudança aparece na cópia local enquanto a operação espera envio. */
export interface OpTarget {
  table: TableName;
  id: string;
  /** Campos gravados na linha local na hora (selo "a enviar"). */
  changes?: Record<string, unknown>;
}

export interface OutboxEntry extends Op {
  target?: OpTarget;
  /** Linha local antes da mudança, para voltar atrás numa recusa. */
  before?: Row | null;
}

export interface ConflictEntry {
  opId: string;
  op: OutboxEntry;
  server: Row | null;
  local: unknown;
  detectedAt: string;
}

export interface RejectionEntry {
  opId: string;
  kind: OpKind;
  code: string;
  message: string;
  rejectedAt: string;
}

export interface Cursor {
  table: TableName;
  updatedAt: string;
}
