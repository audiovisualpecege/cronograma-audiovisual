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
  SeriesRuleRow,
  ServiceTypeRow,
  SlotRow,
  WeekRow,
} from '../data/catalog';
import { isSimulating, previewWeekRows, setPreviewSize, usePreviewExternal, usePreviewPeople, usePreviewSeries, usePreviewSizes } from '../dev/sizePreview';
import type { LocalStore } from '../sync/localStore';
import type { SyncEngine } from '../sync/syncEngine';
import { useLocalQuery } from '../sync/SyncProvider';
import type { TableName } from '../sync/types';
import type { AutoSize, WeekRows } from './model';

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
  const [people, personRoles, absences, roles, types, crew, seriesRules] = await Promise.all([
    all<PersonRow>(store, 'people'),
    all<PersonRoleRow>(store, 'person_roles'),
    all<AbsenceRow>(store, 'absences'),
    all<JobRoleRow>(store, 'job_roles'),
    all<ServiceTypeRow>(store, 'service_types'),
    all<CrewRow>(store, 'service_type_crew'),
    all<SeriesRuleRow>(store, 'series_rules'),
  ]);
  return { weekStart, week: week ?? null, events, slots, assignments, published, people, personRoles, absences, roles, types, crew, seriesRules };
}

export function useWeekRows(weekStart: string): WeekRows | undefined {
  const rows = useLocalQuery((store) => readWeekRows(store, weekStart), [weekStart]);
  // No app local, sem as migrações 0017 a 0020 no banco, a semana aparece como ficaria com elas (dev/sizePreview).
  const sizes = usePreviewSizes();
  const learned = usePreviewSeries();
  // Sede, horário e "externo" guardados no navegador entram pela simulação; mudar um deles refaz a semana.
  const people = usePreviewPeople();
  const external = usePreviewExternal();
  return useMemo(() => rows && previewWeekRows(rows, sizes, learned), [rows, sizes, learned, people, external]); // eslint-disable-line react-hooks/exhaustive-deps
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

/**
 * "Montar semana" (US-012): cria as vagas pelos tipos dos eventos, pela fila (`week.build`). `sizes` leva o porte
 * aplicado sozinho (série ou histórico) dos eventos sem porte; na simulação do app local, fica neste navegador.
 */
export async function buildWeek(engine: SyncEngine, weekStart: string, sizes: ReadonlyMap<string, AutoSize> = new Map()): Promise<void> {
  if (isSimulating()) for (const [id, s] of sizes) setPreviewSize(id, s.size);
  const payload = sizes.size > 0 ? { week_start: weekStart, sizes: Object.fromEntries([...sizes].map(([id, s]) => [id, s.size])) } : { week_start: weekStart };
  await engine.enqueue('week.build', payload);
  await sendAndRefresh(engine, WEEK_TABLES);
}

/** Vaga a mais no evento; ensina a série (migração 0021). Sem versão de base: pôr vaga não entra em conflito. */
export function addSlot(engine: SyncEngine, eventId: string, roleId: string) {
  const id = crypto.randomUUID();
  return engine.enqueue('slot.add', { id, event_id: eventId, job_role_id: roleId }, { target: { table: 'slots', id, changes: { event_id: eventId, job_role_id: roleId, extra: true, archived_at: null } } });
}

/** Tira a vaga do evento, mesmo com alguém nela (a pessoa é liberada); ensina a série (migração 0021). */
export function removeSlot(engine: SyncEngine, slot: SlotRow) {
  return engine.enqueue('slot.remove', { id: slot.id }, { baseVersion: slot.version, target: { table: 'slots', id: slot.id, changes: { archived_at: new Date().toISOString() } } });
}

/** Montagem da semana ainda na fila de envio (sem internet). */
export function useBuildPending(weekStart: string): boolean | undefined {
  return useLocalQuery(
    async (store) => (await store.outbox.toArray()).some((op) => op.kind === 'week.build' && (op.payload as { week_start?: string }).week_start === weekStart),
    [weekStart],
  );
}
