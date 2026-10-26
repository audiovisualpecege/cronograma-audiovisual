// Leitura dos cadastros na cópia local (ADR-009). As linhas chegam do servidor em snake_case; as que estão
// na fila trazem também os campos gravados na hora (`role_ids`, `crew`), que o servidor guarda em outras
// tabelas e só voltam na próxima leitura.
import { effectiveSize, isEventSize, SINGLE_CREW_SIZE, type EventSize, type HistoryFact } from '@cronograma/core';
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
  /** Funções na ordem de prioridade, enquanto o cadastro está na fila. */
  role_ids?: string[];
  /** Nível em cada função (1 Apoio, 2 Titular, 3 Referência), enquanto o cadastro está na fila. */
  role_levels?: Record<string, number>;
}

export interface PersonRoleRow extends Row {
  person_id: string;
  job_role_id: string;
  archived_at: string | null;
  /** Ordem da função na lista da pessoa (1 = principal); nulo antes de alguém ordenar. */
  priority?: number | null;
  /** 1 Apoio, 2 Titular, 3 Referência. */
  level?: number;
}

export const LEVEL_LABEL: Record<number, string> = { 1: 'Apoio', 2: 'Titular', 3: 'Referência' };

export interface SectorRow extends Row {
  name: string;
  archived_at: string | null;
}

export interface JobRoleRow extends Row {
  code: string;
  name: string;
  sector_id: string | null;
  archived_at: string | null;
  /** Não ocupa horário (Disponibilizador): não soma horas nem bate horário com as outras atividades. */
  no_hours?: boolean;
}

export interface CrewItem {
  job_role_id: string;
  quantity: number;
  /** Porte (1 Simples, 2 Médio, 3 Grande); tipo sem porte guarda a equipe única no 2. Sem o campo, 2. */
  size?: number;
}

export interface ServiceTypeRow extends Row {
  code: string;
  name: string;
  keywords: string[];
  no_team: boolean;
  /** Chave do banco de ícones (ui/typeIcons); nulo usa um ícone pelo nome. */
  icon?: string | null;
  /** Trabalho complexo: a escala sugerida chama a Referência da função primeiro. */
  complex?: boolean;
  /** Tem porte (Simples, Médio, Grande), com uma equipe típica para cada um. */
  sized?: boolean;
  /** Porte de quem não escolheu (1 Simples, 2 Médio, 3 Grande). */
  default_size?: number;
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
  archived_at: string | null;
}

export interface SettingsRow extends Row {
  calendar_poll_enabled: boolean;
  calendar_poll_minutes: number;
  ai_proposal_enabled: boolean;
  ai_classification_enabled: boolean;
  ai_provider: string;
  ai_model: string;
  ai_key_hint: string | null;
  /** Modelo local (MiniCPM5 ou outro): endereço do servidor e nome do modelo nele. */
  ai_local_url?: string | null;
  ai_local_model?: string;
  push_enabled_global: boolean;
  worker_seen_at?: string | null;
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
  revision?: number;
  dirty_since?: string | null;
  published_at?: string | null;
  published_by?: string | null;
}

/** Estado do evento antes da mudança vinda da agenda (US-011 AC-2), em camelCase como o worker grava. */
export interface ChangeOriginal {
  title?: string | null;
  location?: string | null;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  allDay?: boolean | null;
}

export interface EventRow extends Row {
  title: string;
  week_start: string;
  starts_at: string;
  ends_at: string;
  status: string;
  origin?: 'calendar' | 'internal';
  calendar_source_id?: string | null;
  location?: string | null;
  description?: string | null;
  all_day?: boolean;
  period_start?: string | null;
  period_end?: string | null;
  change_original?: ChangeOriginal | null;
  review_pending?: boolean;
  restored?: boolean;
  duplicate_group?: string | null;
  ignored?: boolean;
  service_type_id?: string | null;
  type_certainty?: 'alta' | 'media' | 'baixa' | null;
  type_source?: string | null;
  no_team?: boolean;
  notes?: string | null;
  crew_outdated?: boolean;
  source_disconnected?: boolean;
  /** Atividade principal da semana (estrela de quem monta a escala). */
  highlighted?: boolean;
  /** Porte escolhido (1 Simples, 2 Médio, 3 Grande); vazio vale o porte padrão do tipo. */
  size?: number | null;
}

export interface SlotRow extends Row {
  event_id: string;
  job_role_id: string;
  archived_at: string | null;
  extra?: boolean;
}

export interface AssignmentRow extends Row {
  slot_id: string;
  event_id: string;
  person_id: string | null;
  status?: 'proposed' | 'confirmed' | null;
  locked?: boolean;
  warnings?: string[];
  override?: boolean;
  reason?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
}

export interface PublishedRow extends Row {
  week_id: string;
  revision: number;
  event_id: string;
  slot_id: string | null;
  job_role_id: string;
  person_id: string | null;
  notes: string | null;
}

/** Todas as linhas de uma tabela espelhada; `undefined` enquanto a cópia local abre. */
export function useTable<T extends Row>(table: TableName): T[] | undefined {
  return useLocalQuery((store) => store.mirror(table).toArray() as unknown as Promise<T[]>, [table]);
}

export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');

const activeRoles = (person: PersonRow, personRoles: readonly PersonRoleRow[]) =>
  personRoles.filter((r) => r.person_id === person.id && !r.archived_at);

/** Funções habilitadas da pessoa, da mais para a menos prioritária: as da fila, quando há, senão as do servidor. */
export function rolesOf(person: PersonRow, personRoles: readonly PersonRoleRow[]): string[] {
  if (person.role_ids) return person.role_ids;
  // Sem prioridade gravada fica no fim, na ordem em que veio.
  return activeRoles(person, personRoles)
    .map((r, i) => ({ id: r.job_role_id, order: r.priority ?? 1000 + i }))
    .sort((a, b) => a.order - b.order)
    .map((r) => r.id);
}

/** A pessoa já tem as funções ordenadas (pela tela ou pela carga), e não só na ordem em que foram marcadas. */
export function hasRoleOrder(person: PersonRow, personRoles: readonly PersonRoleRow[]): boolean {
  return Boolean(person.role_ids) || activeRoles(person, personRoles).some((r) => r.priority != null);
}

/** Nível da pessoa em cada função; função sem nível gravado vale Titular (2). */
export function levelsOf(person: PersonRow, personRoles: readonly PersonRoleRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of activeRoles(person, personRoles)) out[r.job_role_id] = r.level ?? 2;
  return { ...out, ...person.role_levels };
}

/**
 * Equipe típica do tipo (a da fila, quando há, senão a do servidor), de todos os portes; com `size`, só a
 * daquele porte.
 */
export function crewOf(type: ServiceTypeRow, crew: readonly CrewRow[], size?: number): CrewItem[] {
  const all = type.crew ?? crew.filter((c) => c.service_type_id === type.id && !c.archived_at);
  return all
    .map((c) => ({ job_role_id: c.job_role_id, quantity: c.quantity, size: c.size ?? SINGLE_CREW_SIZE }))
    .filter((c) => size === undefined || c.size === size);
}

/** Porte que vale para o evento deste tipo: o escolhido, senão o padrão do tipo. */
export function sizeFor(type: ServiceTypeRow, size: number | null | undefined): EventSize {
  return effectiveSize(size, Boolean(type.sized), type.default_size);
}

/** Equipe do tipo no porte que vale para o evento (sem porte escolhido, o padrão; tipo sem porte, a única). */
export function crewForSize(type: ServiceTypeRow, crew: readonly CrewRow[], size: number | null | undefined): CrewItem[] {
  return crewOf(type, crew, sizeFor(type, size));
}

/** Total de vagas de cada porte do tipo. */
export function crewTotals(type: ServiceTypeRow, crew: readonly CrewRow[]): Record<EventSize, number> {
  const out: Record<EventSize, number> = { 1: 0, 2: 0, 3: 0 };
  for (const c of crewOf(type, crew)) if (isEventSize(c.size)) out[c.size] += c.quantity;
  return out;
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
