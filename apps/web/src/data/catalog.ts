// Leitura dos cadastros na cópia local (ADR-009). As linhas chegam do servidor em snake_case; as que estão
// na fila trazem também os campos gravados na hora (`role_ids`, `crew`), que o servidor guarda em outras
// tabelas e só voltam na próxima leitura.
import type { HistoryFact } from '@cronograma/core';
import { useLocalQuery } from '../sync/SyncProvider';
import type { Row, TableName } from '../sync/types';

export interface PersonRow extends Row {
  code: string;
  name: string;
  email: string | null;
  sector_id: string | null;
  profile: 'admin' | 'team';
  weekly_limit_hours: number | string;
  active: boolean;
  invite_status: 'pending' | 'sent' | 'accepted';
  role_ids?: string[];
}

export interface PersonRoleRow extends Row {
  person_id: string;
  job_role_id: string;
  archived_at: string | null;
}

export interface SectorRow extends Row {
  name: string;
  archived_at: string | null;
}

export interface JobRoleRow extends Row {
  code: string;
  name: string;
  sector_id: string | null;
  archived_at: string | null;
}

export interface CrewItem {
  job_role_id: string;
  quantity: number;
}

export interface ServiceTypeRow extends Row {
  code: string;
  name: string;
  keywords: string[];
  no_team: boolean;
  archived_at: string | null;
  crew?: CrewItem[];
}

export interface CrewRow extends Row, CrewItem {
  service_type_id: string;
  archived_at: string | null;
}

export type AbsenceKind = 'folga' | 'ferias' | 'ausencia';

export interface AbsenceRow extends Row {
  person_id: string;
  kind: AbsenceKind;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  note: string | null;
  archived_at: string | null;
}

export interface CalendarSourceRow extends Row {
  google_calendar_id: string;
  label: string;
  enabled: boolean;
  status: 'pending' | 'connected' | 'error';
  last_synced_at: string | null;
  last_error: string | null;
}

export interface SettingsRow extends Row {
  calendar_poll_enabled: boolean;
  calendar_poll_minutes: number;
  ai_proposal_enabled: boolean;
  ai_classification_enabled: boolean;
  ai_provider: string;
  ai_model: string;
  ai_key_hint: string | null;
  push_enabled_global: boolean;
}

export interface JobRow extends Row {
  kind: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

export interface WeekRow extends Row {
  week_start: string;
  state: 'building' | 'published';
}

export interface EventRow extends Row {
  title: string;
  week_start: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

export interface SlotRow extends Row {
  event_id: string;
  job_role_id: string;
  archived_at: string | null;
}

export interface AssignmentRow extends Row {
  slot_id: string;
  event_id: string;
  person_id: string | null;
}

/** Todas as linhas de uma tabela espelhada; `undefined` enquanto a cópia local abre. */
export function useTable<T extends Row>(table: TableName): T[] | undefined {
  return useLocalQuery((store) => store.mirror(table).toArray() as unknown as Promise<T[]>, [table]);
}

export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');

/** Funções habilitadas da pessoa: as da fila, quando há, senão as do servidor. */
export function rolesOf(person: PersonRow, personRoles: readonly PersonRoleRow[]): string[] {
  if (person.role_ids) return person.role_ids;
  return personRoles.filter((r) => r.person_id === person.id && !r.archived_at).map((r) => r.job_role_id);
}

/** Equipe típica do tipo: a da fila, quando há, senão a do servidor. */
export function crewOf(type: ServiceTypeRow, crew: readonly CrewRow[]): CrewItem[] {
  if (type.crew) return type.crew;
  return crew
    .filter((c) => c.service_type_id === type.id && !c.archived_at)
    .map((c) => ({ job_role_id: c.job_role_id, quantity: c.quantity }));
}

/** Linha da view history_facts como o PostgREST devolve. */
export interface HistoryFactRow {
  event_id: string;
  week_start: string;
  event_date: string;
  title: string;
  service_type_id: string | null;
  service_type_name: string | null;
  job_role_id: string | null;
  job_role_name: string | null;
  person_id: string | null;
  person_name: string | null;
  raw_name: string | null;
  hours: number | string | null;
  source: 'import' | 'platform';
}

export const HISTORY_COLUMNS =
  'event_id, week_start, event_date, title, service_type_id, service_type_name, job_role_id, job_role_name, person_id, person_name, raw_name, hours, source';
export const HISTORY_ORDER = ['event_id', 'job_role_id', 'person_id', 'raw_name'];

export function toFact(r: HistoryFactRow): HistoryFact {
  return {
    eventId: r.event_id,
    weekStart: r.week_start,
    eventDate: r.event_date,
    title: r.title,
    serviceTypeId: r.service_type_id,
    jobRoleId: r.job_role_id,
    personId: r.person_id,
    hours: Number(r.hours ?? 0),
  };
}
