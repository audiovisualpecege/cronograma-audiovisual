import type { AbsenceRow, EventRow, JobRoleRow, PublishedRow, SectorRow, ServiceTypeRow, WeekRow } from '../data/catalog';
import type { LocalStore } from '../sync/localStore';
import { useLocalQuery } from '../sync/SyncProvider';
import type { TableName } from '../sync/types';
import type { PublicPerson, TeamRows } from './model';

async function all<T>(store: LocalStore, table: TableName): Promise<T[]> {
  return (await store.mirror(table).toArray()) as unknown as T[];
}

/** O que a visão da equipe precisa da cópia local; a RLS já limita a equipe às semanas publicadas. */
export async function readTeamRows(store: LocalStore, weekStart: string): Promise<TeamRows> {
  const [week] = (await store.mirror('weeks').where('week_start').equals(weekStart).toArray()) as unknown as WeekRow[];
  const events = (await store.mirror('events').where('week_start').equals(weekStart).toArray()) as unknown as EventRow[];
  const published = week ? ((await store.mirror('published_assignments').where('week_id').equals(week.id).toArray()) as unknown as PublishedRow[]) : [];
  const [pub, own, roles, sectors, types, absences] = await Promise.all([
    all<PublicPerson>(store, 'people_public'),
    all<PublicPerson>(store, 'people'),
    all<JobRoleRow>(store, 'job_roles'),
    all<SectorRow>(store, 'sectors'),
    all<ServiceTypeRow>(store, 'service_types'),
    all<AbsenceRow>(store, 'absences'),
  ]);
  // people_public traz todos sem e-mail; people completa com o próprio cadastro (e todos, para administradores).
  const people = new Map<string, PublicPerson>(own.map((p) => [p.id, p]));
  for (const p of pub) people.set(p.id, p);
  return { weekStart, week: week ?? null, events, published, people: [...people.values()], roles, sectors, types, absences };
}

export function useTeamRows(weekStart: string): TeamRows | undefined {
  return useLocalQuery((store) => readTeamRows(store, weekStart), [weekStart]);
}
