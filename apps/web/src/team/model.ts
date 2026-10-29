// Visão da equipe, pura: a semana publicada lida da fotografia corrente (ADR-011). A cópia local guarda
// também linhas de revisões antigas já puxadas; aqui só entra a revisão corrente da semana, e nada de
// vaga, proposta ou alteração não publicada (US-020 EC-2).
import { localDate } from '@cronograma/core';
import type { AbsenceKind, AbsenceRow, EventRow, JobRoleRow, PublishedRow, SectorRow, ServiceTypeRow, WeekRow } from '../data/catalog';
import { changeLines } from '../event/changes';
import { typeNoTeam, weekDays } from '../week/model';

/** Pessoa como a equipe vê (view people_public, sem e-mail). */
export interface PublicPerson {
  id: string;
  code?: string;
  name: string;
  sector_id: string | null;
}

export interface TeamRows {
  weekStart: string;
  week: WeekRow | null;
  events: EventRow[];
  published: PublishedRow[];
  people: PublicPerson[];
  roles: JobRoleRow[];
  sectors: SectorRow[];
  types: ServiceTypeRow[];
  absences: AbsenceRow[];
}

export interface Crew {
  roleId: string;
  roleName: string;
  personId: string | null;
  personName: string | null;
}

export interface Activity {
  event: EventRow;
  day: string;
  crew: Crew[];
  notes: string | null;
  cancelled: boolean;
  /** Reunião (tipo sem equipe ligado a setores): sem escala, aparece para quem é destes setores. */
  meetingSectors?: string[];
}

export interface PublishedWeek {
  /** Semana publicada (alguma revisão já saiu). */
  published: boolean;
  activities: Activity[];
}

export function isPublished(week: WeekRow | null): week is WeekRow {
  return Boolean(week && (week.state === 'published' || (week.revision ?? 0) > 0));
}

/** Tipo sem equipe ligado a setores: reunião que a equipe desses setores vê, sem escala. */
export function meetingSectorsOf(e: EventRow, types: readonly ServiceTypeRow[]): string[] | null {
  const type = types.find((t) => t.id === e.service_type_id);
  if (!type?.no_team || !type.sector_ids?.length) return null;
  return type.sector_ids;
}

/**
 * Atividades da fotografia corrente, em ordem de início, mais as reuniões ligadas a setores (sem escala);
 * os outros eventos que não exigem equipe ficam de fora.
 */
export function publishedWeek(rows: TeamRows): PublishedWeek {
  const week = rows.week;
  if (!isPublished(week)) return { published: false, activities: [] };
  const current = rows.published.filter((p) => p.week_id === week.id && p.revision === week.revision);
  const roleName = new Map(rows.roles.map((r) => [r.id, r.name]));
  const personName = new Map(rows.people.map((p) => [p.id, p.name]));
  const byEvent = new Map<string, PublishedRow[]>();
  for (const p of current) byEvent.set(p.event_id, [...(byEvent.get(p.event_id) ?? []), p]);
  const events = new Map(rows.events.map((e) => [e.id, e]));
  const activities: Activity[] = [];
  for (const [eventId, list] of byEvent) {
    const event = events.get(eventId);
    if (!event || event.ignored || event.no_team || typeNoTeam(rows.types, event.service_type_id)) continue;
    const crew = list
      .map((p) => ({
        roleId: p.job_role_id,
        roleName: roleName.get(p.job_role_id) ?? 'Função',
        personId: p.person_id,
        personName: p.person_id ? (personName.get(p.person_id) ?? 'Pessoa') : null,
      }))
      .sort((a, b) => a.roleName.localeCompare(b.roleName, 'pt-BR') || (a.personName ?? '~').localeCompare(b.personName ?? '~', 'pt-BR'));
    activities.push({
      event,
      day: localDate(new Date(event.starts_at)),
      crew,
      notes: list.find((p) => p.notes)?.notes ?? event.notes ?? null,
      cancelled: event.status === 'cancelled',
    });
  }
  for (const event of rows.events) {
    if (event.ignored || byEvent.has(event.id)) continue;
    const sectors = meetingSectorsOf(event, rows.types);
    if (!sectors) continue;
    activities.push({ event, day: localDate(new Date(event.starts_at)), crew: [], notes: event.notes ?? null, cancelled: event.status === 'cancelled', meetingSectors: sectors });
  }
  activities.sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at) || a.event.title.localeCompare(b.event.title, 'pt-BR'));
  return { published: true, activities };
}

// ---------------------------------------------------------------------------------------------
// Minha semana

export const ABSENCE_LABEL: Record<AbsenceKind, string> = { folga: 'folga', ferias: 'férias', ausencia: 'ausência' };

export interface MyActivity extends Activity {
  /** Funções da pessoa na atividade. */
  myRoles: string[];
  colleagues: Crew[];
  /** Campos que mudaram desde a última vez que a pessoa olhou (selo "mudou"). */
  changes: { label: string; before: string; after: string }[] | null;
}

export interface MyDay {
  date: string;
  label: string;
  today: boolean;
  absences: AbsenceKind[];
  activities: MyActivity[];
}

export interface MyWeek {
  published: boolean;
  days: MyDay[];
  /** A pessoa tem ao menos uma atividade na semana. */
  scheduled: boolean;
  /** Próxima atividade de hoje (ou em andamento), que vai para o topo do dia. */
  nextId: string | null;
}

function absenceDays(a: AbsenceRow, weekStart: string): Set<string> {
  const out = new Set<string>();
  const start = Date.parse(a.starts_at);
  const end = Date.parse(a.ends_at);
  for (const d of weekDays(weekStart)) {
    const dayStart = Date.parse(`${d.date}T00:00:00-03:00`);
    const dayEnd = dayStart + 24 * 3_600_000;
    if (start < dayEnd && end > dayStart) out.add(d.date);
  }
  return out;
}

/** Semana da pessoa por dia, hoje destacado e a próxima atividade no topo (US-019). */
export function myWeek(rows: TeamRows, personId: string, now: Date, seenAt: string | null): MyWeek {
  const week = publishedWeek(rows);
  const today = localDate(now);
  const sector = rows.people.find((p) => p.id === personId)?.sector_id ?? null;
  const mine: MyActivity[] = week.activities
    .filter((a) => a.crew.some((c) => c.personId === personId) || Boolean(sector && a.meetingSectors?.includes(sector)))
    .map((a) => ({
      ...a,
      myRoles: a.crew.filter((c) => c.personId === personId).map((c) => c.roleName),
      colleagues: a.crew.filter((c) => c.personId !== personId),
      changes: seenAt && a.event.change_original && !a.cancelled && a.event.updated_at > seenAt ? changeLines(a.event) : null,
    }));
  const upcoming = mine.filter((a) => a.day === today && !a.cancelled && Date.parse(a.event.ends_at) > now.getTime());
  const nextId = upcoming[0]?.event.id ?? null;
  const absences = rows.absences.filter((a) => a.person_id === personId && !a.archived_at);
  const days = weekDays(rows.weekStart).map((d) => {
    const list = mine.filter((a) => a.day === d.date);
    if (d.date === today && nextId) list.sort((a, b) => Number(b.event.id === nextId) - Number(a.event.id === nextId));
    return {
      date: d.date,
      label: d.label,
      today: d.date === today,
      absences: [...new Set(absences.filter((a) => absenceDays(a, rows.weekStart).has(d.date)).map((a) => a.kind))],
      activities: list,
    };
  });
  return { published: week.published, days, scheduled: mine.length > 0, nextId };
}

/** Endereço do mapa do aparelho para o local (US-019 EC-6). */
export function mapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

// ---------------------------------------------------------------------------------------------
// Equipe

export interface TeamFilter {
  sectorId: string;
  roleId: string;
  personId: string;
}

export const NO_FILTER: TeamFilter = { sectorId: '', roleId: '', personId: '' };

export function hasFilter(f: TeamFilter): boolean {
  return Boolean(f.sectorId || f.roleId || f.personId);
}

/**
 * Atividades com ao menos uma linha que passa em todos os filtros. Setor é o da pessoa escalada; numa vaga
 * "a definir", o da função. Reunião de setor entra pelo setor (o filtrado ou o da pessoa filtrada); filtro por
 * função a deixa de fora.
 */
export function filterActivities(activities: readonly Activity[], f: TeamFilter, rows: Pick<TeamRows, 'people' | 'roles'>): Activity[] {
  if (!hasFilter(f)) return [...activities];
  const personSector = new Map(rows.people.map((p) => [p.id, p.sector_id]));
  const roleSector = new Map(rows.roles.map((r) => [r.id, r.sector_id]));
  const match = (c: Crew) =>
    (!f.roleId || c.roleId === f.roleId) &&
    (!f.personId || c.personId === f.personId) &&
    (!f.sectorId || (c.personId ? personSector.get(c.personId) : roleSector.get(c.roleId)) === f.sectorId);
  const meetingMatch = (sectors: readonly string[]) => {
    if (f.roleId) return false;
    const of = f.personId ? personSector.get(f.personId) : null;
    return (!f.sectorId || sectors.includes(f.sectorId)) && (!f.personId || Boolean(of && sectors.includes(of)));
  };
  return activities.filter((a) => (a.meetingSectors ? meetingMatch(a.meetingSectors) : a.crew.some(match)));
}

/** Linhas da lista virtual da "Equipe": dia, atividade e cada vaga, todas da mesma altura. */
export type TeamLine =
  | { kind: 'day'; key: string; label: string; today: boolean }
  | { kind: 'event'; key: string; activity: Activity }
  | { kind: 'crew'; key: string; activity: Activity; crew: Crew };

export function teamLines(activities: readonly Activity[], weekStart: string, today: string): TeamLine[] {
  const out: TeamLine[] = [];
  for (const d of weekDays(weekStart)) {
    const list = activities.filter((a) => a.day === d.date);
    if (list.length === 0) continue;
    out.push({ kind: 'day', key: `d:${d.date}`, label: d.label, today: d.date === today });
    for (const a of list) {
      out.push({ kind: 'event', key: `e:${a.event.id}`, activity: a });
      a.crew.forEach((c, i) => out.push({ kind: 'crew', key: `c:${a.event.id}:${i}`, activity: a, crew: c }));
    }
  }
  return out;
}
