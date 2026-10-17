// Leitura da semana na cópia local e as ações da escala pela fila de envio (ADR-009). Cada ação grava na
// hora a linha local (selo "a enviar") e leva a versão da linha, para o servidor apontar conflito.
import { useEffect, useMemo, useState } from 'react';
import type {
  AbsenceRow,
  AssignmentRow,
  CrewRow,
  EventRow,
  JobRoleRow,
  PersonRoleRow,
  PersonRow,
  PublishedRow,
  ServiceTypeRow,
  SlotRow,
  WeekRow,
} from '../data/catalog';
import type { LocalStore } from '../sync/localStore';
import type { SyncEngine } from '../sync/syncEngine';
import { useLocalQuery } from '../sync/SyncProvider';
import type { TableName } from '../sync/types';
import type { WeekRows } from './model';

async function all<T>(store: LocalStore, table: TableName): Promise<T[]> {
  return (await store.mirror(table).toArray()) as unknown as T[];
}

/** Tudo o que as telas da semana precisam, numa consulta viva. */
export async function readWeekRows(store: LocalStore, weekStart: string): Promise<WeekRows> {
  const [week] = (await store.mirror('weeks').where('week_start').equals(weekStart).toArray()) as unknown as WeekRow[];
  const events = (await store.mirror('events').where('week_start').equals(weekStart).toArray()) as unknown as EventRow[];
  const ids = events.map((e) => e.id);
  const slots = (await store.mirror('slots').where('event_id').anyOf(ids).toArray()) as unknown as SlotRow[];
  const assignments = (await store.mirror('assignments').where('event_id').anyOf(ids).toArray()) as unknown as AssignmentRow[];
  const published = week
    ? ((await store.mirror('published_assignments').where('week_id').equals(week.id).toArray()) as unknown as PublishedRow[])
    : [];
  const [people, personRoles, absences, roles, types, crew] = await Promise.all([
    all<PersonRow>(store, 'people'),
    all<PersonRoleRow>(store, 'person_roles'),
    all<AbsenceRow>(store, 'absences'),
    all<JobRoleRow>(store, 'job_roles'),
    all<ServiceTypeRow>(store, 'service_types'),
    all<CrewRow>(store, 'service_type_crew'),
  ]);
  return { weekStart, week: week ?? null, events, slots, assignments, published, people, personRoles, absences, roles, types, crew };
}

export function useWeekRows(weekStart: string): WeekRows | undefined {
  return useLocalQuery((store) => readWeekRows(store, weekStart), [weekStart]);
}

/** Relógio da tela, atualizado a cada minuto (selo "hoje", aviso do serviço de fundo). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Mapa por id, refeito só quando a lista muda. */
export function useById<T extends { id: string }>(items: readonly T[] | undefined): Map<string, T> {
  return useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
}

// ---------------------------------------------------------------------------------------------
// Ações da escala

const OPEN = { person_id: null, status: null, locked: false, override: false, reason: null };

export function setPerson(engine: SyncEngine, a: AssignmentRow, personId: string, warnings: string[], override: boolean) {
  return engine.enqueue(
    'assignment.set',
    { slot_id: a.slot_id, person_id: personId, override },
    {
      baseVersion: a.version,
      target: { table: 'assignments', id: a.id, changes: { person_id: personId, status: 'confirmed', warnings, override: override && warnings.length > 0, reason: null } },
    },
  );
}

/** "Desfazer": a alocação volta a aberta (US-014 EC-4). */
export function clearSlot(engine: SyncEngine, a: AssignmentRow) {
  return engine.enqueue('assignment.clear', { slot_id: a.slot_id }, { baseVersion: a.version, target: { table: 'assignments', id: a.id, changes: { ...OPEN, warnings: [] } } });
}

export function lockSlot(engine: SyncEngine, a: AssignmentRow, locked: boolean) {
  return engine.enqueue('assignment.lock', { slot_id: a.slot_id, locked }, { baseVersion: a.version, target: { table: 'assignments', id: a.id, changes: { locked } } });
}

export function acceptProposal(engine: SyncEngine, a: AssignmentRow) {
  return engine.enqueue('assignment.accept', { slot_id: a.slot_id }, { baseVersion: a.version, target: { table: 'assignments', id: a.id, changes: { status: 'confirmed' } } });
}

export function discardProposal(engine: SyncEngine, a: AssignmentRow) {
  return engine.enqueue('assignment.discard', { slot_id: a.slot_id }, { baseVersion: a.version, target: { table: 'assignments', id: a.id, changes: { ...OPEN, warnings: [] } } });
}

/** Com internet, envia a fila e lê de novo as tabelas que o servidor muda por conta própria. */
export async function sendAndRefresh(engine: SyncEngine, tables: TableName[]): Promise<void> {
  if (!engine.getState().online) return;
  await engine.flush().catch(() => undefined);
  await Promise.all(tables.map((t) => engine.pull(t).catch(() => 0)));
}

export const WEEK_TABLES: TableName[] = ['weeks', 'events', 'slots', 'assignments', 'published_assignments', 'publications'];
