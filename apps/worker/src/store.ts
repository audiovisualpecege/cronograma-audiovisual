// Acesso ao Supabase com a service_role, a única chave que o worker tem (ADR-006). Cada componente depende
// só da porta que usa; os testes de unidade trocam a porta por um falso em memória.
import type { CalendarChange, EventSnapshot } from '@cronograma/core';
import type { SupabaseClient } from '@supabase/supabase-js';

export type JobKind =
  | 'calendar_sync' | 'classify' | 'propose' | 'test_ai_key' | 'invite'
  | 'auth_ban' | 'auth_unban' | 'ical_publish' | 'ical_revoke';

export interface JobRow {
  id: string;
  kind: JobKind;
  status: 'queued' | 'running' | 'done' | 'failed';
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  requested_by: string | null;
  created_at: string;
}

export interface SettingsRow {
  calendar_poll_enabled: boolean;
  calendar_poll_minutes: number;
  ai_proposal_enabled: boolean;
  ai_classification_enabled: boolean;
  ai_provider: string;
  ai_model: string;
  /** Endereço do servidor do modelo local (Ollama e similares); nulo até alguém configurar. */
  ai_local_url?: string | null;
  ai_local_model?: string;
  push_enabled_global: boolean;
}

export interface Notice {
  kind: string;
  title: string;
  body: string;
  link: string;
  dedupe: string;
  /** Não mexe num aviso que já existe com o mesmo dedupe (lembretes). */
  once?: boolean;
}

export interface SourceRow {
  id: string;
  google_calendar_id: string;
  label: string;
  enabled: boolean;
  status: 'pending' | 'connected' | 'error';
  last_synced_at: string | null;
  last_error: string | null;
}

export interface StoredEventRow {
  id: string;
  google_event_id: string;
  week_start: string;
  title: string;
  location: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  fingerprint: string | null;
  status: 'active' | 'changed' | 'cancelled';
  change_original: EventSnapshot | null;
}

export interface EventType {
  service_type_id: string | null;
  certainty: 'alta' | 'media' | 'baixa';
  source: 'series' | 'keyword' | 'history' | 'ai' | null;
  no_team: boolean;
}

export interface ServiceTypeRow {
  id: string;
  code: string;
  name: string;
  keywords: string[];
  no_team: boolean;
}

export interface NotificationRow {
  id: string;
  person_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupe_key: string;
  pushed_at: string | null;
  created_at: string;
  version: number;
}

export interface SubscriptionRow {
  id: string;
  person_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PersonPushRow {
  id: string;
  active: boolean;
  push_enabled: boolean;
  ical_token: string | null;
}

export interface AuthPersonRow {
  id: string;
  email: string | null;
  active: boolean;
  auth_user_id: string | null;
  invite_status: 'pending' | 'sent' | 'accepted';
}

/** Tudo o que a pré-escala lê de uma semana. Sem nome nem e-mail de ninguém (ADR-001). */
export interface ProposalData {
  week: { id: string; week_start: string; state: 'building' | 'published' };
  people: { id: string; code: string; active: boolean; weekly_limit_hours: number; role_ids: string[] }[];
  events: {
    id: string; week_start: string; starts_at: string; ends_at: string; all_day: boolean;
    period_start: string | null; period_end: string | null; status: 'active' | 'changed' | 'cancelled';
    service_type_id: string | null; no_team: boolean; ignored: boolean;
  }[];
  slots: { id: string; event_id: string; job_role_id: string }[];
  assignments: { slot_id: string; event_id: string; person_id: string | null; status: 'proposed' | 'confirmed' | null; locked: boolean }[];
  absences: { person_id: string; starts_at: string; ends_at: string }[];
  /** no_hours só existe no banco com a migração 0018 (Disponibilizador). */
  jobRoles: { id: string; code: string; no_hours?: boolean }[];
  serviceTypes: { id: string; code: string; no_team: boolean }[];
  history: { person_id: string | null; job_role_id: string | null; service_type_id: string | null }[];
}

export interface ProposalWrite {
  slot_id: string;
  person_id: string | null;
  reason: string;
  keep_person?: boolean;
}

export interface IcalItem {
  event_id: string;
  job_role_id: string;
  role_name: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  colleagues: string[];
}

export interface IcalFeed {
  person: { id: string; name: string; active: boolean; ical_token: string | null };
  items: IcalItem[];
}

// ---------------------------------------------------------------------------------------------
// Portas

export interface SettingsStore {
  settings(): Promise<SettingsRow>;
}

export interface NoticeStore {
  notifyAdmins(n: Notice): Promise<number>;
}

export interface QueueStore {
  claimJob(id: string): Promise<JobRow | null>;
  queuedJobs(limit: number): Promise<JobRow[]>;
  finishJob(id: string, patch: { status: 'done' | 'failed'; result?: Record<string, unknown> | null; error?: string | null }): Promise<void>;
  saveJobResult(id: string, result: Record<string, unknown>): Promise<void>;
  requeueRunning(): Promise<number>;
}

export interface HeartbeatStore {
  touchWorkerSeen(at: Date): Promise<void>;
}

export interface SchedulerStore extends SettingsStore, NoticeStore {
  enqueueJob(kind: JobKind, payload: Record<string, unknown>, dedupe: string | null): Promise<string>;
  dirtyPublishedWeeks(): Promise<{ id: string; week_start: string; dirty_since: string }[]>;
  sources(): Promise<SourceRow[]>;
  syncInviteStatus(): Promise<number>;
}

export interface CleanupStore {
  deleteNotificationsBefore(at: Date): Promise<number>;
}

export interface CalendarStore extends NoticeStore {
  sources(): Promise<SourceRow[]>;
  storedEvents(sourceId: string, from: Date, to: Date): Promise<StoredEventRow[]>;
  storedByGoogleIds(sourceId: string, googleIds: string[]): Promise<StoredEventRow[]>;
  updateSource(id: string, patch: Partial<Pick<SourceRow, 'status' | 'last_synced_at' | 'last_error'>>): Promise<void>;
  applyCalendarChange(sourceId: string, googleEventId: string, change: CalendarChange, type: EventType | null): Promise<void>;
  markSourceDisconnected(sourceId: string, disconnected: boolean): Promise<void>;
  setFingerprint(eventId: string, fingerprint: string): Promise<void>;
}

export interface ClassifierStore extends SettingsStore {
  serviceTypes(): Promise<ServiceTypeRow[]>;
  historyTitles(): Promise<{ title: string; serviceTypeId: string }[]>;
  /** Tipo que cada série aprendeu com a correção do administrador (migração 0020). */
  seriesTypes(): Promise<Map<string, string>>;
  secret(name: string): Promise<string | null>;
  unclassifiedEvents(fromWeek: string): Promise<{ id: string; title: string }[]>;
  setEventType(eventId: string, type: EventType): Promise<void>;
}

export interface ProposalStore extends SettingsStore, NoticeStore {
  proposalData(weekId: string): Promise<ProposalData>;
  writeProposals(items: ProposalWrite[]): Promise<number>;
  secret(name: string): Promise<string | null>;
}

export interface AiKeyStore extends SettingsStore {
  secret(name: string): Promise<string | null>;
  promoteAiKey(hint: string | null): Promise<void>;
  dropPendingAiKey(): Promise<void>;
}

export interface PushStore extends SettingsStore {
  notification(id: string): Promise<NotificationRow | null>;
  unpushedNotifications(since: Date, limit: number): Promise<NotificationRow[]>;
  personPush(personId: string): Promise<PersonPushRow | null>;
  subscriptions(personId: string): Promise<SubscriptionRow[]>;
  deleteSubscription(id: string): Promise<void>;
  touchSubscription(id: string, at: Date): Promise<void>;
  markPushed(notificationId: string, at: Date): Promise<void>;
  enqueueJob(kind: JobKind, payload: Record<string, unknown>, dedupe: string | null): Promise<string>;
}

export interface IcalStore {
  icalFeed(personId: string, fromWeek: string): Promise<IcalFeed | null>;
  clearIcalToken(personId: string): Promise<void>;
  uploadIcal(token: string, body: string): Promise<void>;
  removeIcal(token: string): Promise<void>;
}

export interface AuthStore {
  authPerson(personId: string): Promise<AuthPersonRow | null>;
  setInvite(personId: string, patch: { invite_status: AuthPersonRow['invite_status']; auth_user_id?: string }): Promise<void>;
}

export const ICAL_BUCKET = 'ical';

// ---------------------------------------------------------------------------------------------
// Implementação com supabase-js

const PAGE = 1000; // max_rows do PostgREST

function check<T>(res: { data: T; error: { message: string; details?: string | null } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}${res.error.details ? ` (${res.error.details})` : ''}`);
  return res.data;
}

type Store = QueueStore & HeartbeatStore & SchedulerStore & CleanupStore & CalendarStore & ClassifierStore &
  ProposalStore & AiKeyStore & PushStore & IcalStore & AuthStore;

export class SupabaseStore implements Store {
  constructor(readonly db: SupabaseClient) {}

  /** Lê todas as páginas de uma consulta (o PostgREST corta em 1.000 linhas). */
  private async all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(await query(from, from + PAGE - 1), what) ?? [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  // Fila ----------------------------------------------------------------------------------

  async claimJob(id: string): Promise<JobRow | null> {
    const rows = check(
      await this.db.from('jobs').update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'queued').select('*'),
      'claimJob',
    );
    return (rows?.[0] as JobRow | undefined) ?? null;
  }

  async queuedJobs(limit: number): Promise<JobRow[]> {
    return check(
      await this.db.from('jobs').select('*').eq('status', 'queued').order('created_at').limit(limit),
      'queuedJobs',
    ) as JobRow[];
  }

  async finishJob(id: string, patch: { status: 'done' | 'failed'; result?: Record<string, unknown> | null; error?: string | null }) {
    check(
      await this.db.from('jobs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id),
      'finishJob',
    );
  }

  async saveJobResult(id: string, result: Record<string, unknown>) {
    check(await this.db.from('jobs').update({ result }).eq('id', id), 'saveJobResult');
  }

  async requeueRunning(): Promise<number> {
    const rows = check(
      await this.db.from('jobs').update({ status: 'queued', started_at: null }).eq('status', 'running').select('id'),
      'requeueRunning',
    );
    return rows?.length ?? 0;
  }

  // Configuração, batimento e agendador ---------------------------------------------------

  async settings(): Promise<SettingsRow> {
    return check(await this.db.from('settings').select('*').single(), 'settings') as SettingsRow;
  }

  async touchWorkerSeen(at: Date) {
    check(await this.db.from('settings').update({ worker_seen_at: at.toISOString() }).eq('singleton', true), 'touchWorkerSeen');
  }

  async enqueueJob(kind: JobKind, payload: Record<string, unknown>, dedupe: string | null): Promise<string> {
    return check(
      await this.db.rpc('enqueue_job', { p_kind: kind, p_payload: payload, p_dedupe: dedupe, p_by: null }),
      'enqueueJob',
    ) as string;
  }

  async dirtyPublishedWeeks() {
    return check(
      await this.db.from('weeks').select('id, week_start, dirty_since').eq('state', 'published').not('dirty_since', 'is', null),
      'dirtyPublishedWeeks',
    ) as { id: string; week_start: string; dirty_since: string }[];
  }

  async syncInviteStatus(): Promise<number> {
    return check(await this.db.rpc('sync_invite_status'), 'syncInviteStatus') as number;
  }

  async notifyAdmins(n: Notice): Promise<number> {
    return check(
      await this.db.rpc('notify_admins', {
        p_kind: n.kind, p_title: n.title, p_body: n.body, p_link: n.link, p_dedupe: n.dedupe, p_once: n.once ?? false,
      }),
      'notifyAdmins',
    ) as number;
  }

  async deleteNotificationsBefore(at: Date): Promise<number> {
    const rows = check(
      await this.db.from('notifications').delete().lt('created_at', at.toISOString()).select('id'),
      'deleteNotificationsBefore',
    );
    return rows?.length ?? 0;
  }

  // Agenda --------------------------------------------------------------------------------

  async sources(): Promise<SourceRow[]> {
    return check(await this.db.from('calendar_sources').select('*').is('archived_at', null).order('label'), 'sources') as SourceRow[];
  }

  async storedEvents(sourceId: string, from: Date, to: Date): Promise<StoredEventRow[]> {
    return this.all<StoredEventRow>(
      (a, b) =>
        this.db.from('events')
          .select('id, google_event_id, week_start, title, location, description, starts_at, ends_at, all_day, fingerprint, status, change_original')
          .eq('calendar_source_id', sourceId).not('google_event_id', 'is', null)
          .gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString())
          .order('id').range(a, b),
      'storedEvents',
    );
  }

  async storedByGoogleIds(sourceId: string, googleIds: string[]): Promise<StoredEventRow[]> {
    const out: StoredEventRow[] = [];
    for (let i = 0; i < googleIds.length; i += 100) {
      out.push(...(check(
        await this.db.from('events')
          .select('id, google_event_id, week_start, title, location, description, starts_at, ends_at, all_day, fingerprint, status, change_original')
          .eq('calendar_source_id', sourceId).in('google_event_id', googleIds.slice(i, i + 100)),
        'storedByGoogleIds',
      ) as StoredEventRow[]));
    }
    return out;
  }

  async updateSource(id: string, patch: Partial<Pick<SourceRow, 'status' | 'last_synced_at' | 'last_error'>>) {
    check(await this.db.from('calendar_sources').update(patch).eq('id', id), 'updateSource');
  }

  async applyCalendarChange(sourceId: string, googleEventId: string, change: CalendarChange, type: EventType | null) {
    check(
      await this.db.rpc('worker_apply_calendar_change', {
        p_source: sourceId, p_google_id: googleEventId, p_change: change, p_type: type,
      }),
      'applyCalendarChange',
    );
  }

  async markSourceDisconnected(sourceId: string, disconnected: boolean) {
    check(await this.db.rpc('mark_source_disconnected', { p_source: sourceId, p_disconnected: disconnected }), 'markSourceDisconnected');
  }

  async setFingerprint(eventId: string, fingerprint: string) {
    check(await this.db.from('events').update({ fingerprint }).eq('id', eventId), 'setFingerprint');
  }

  // Classificação e IA --------------------------------------------------------------------

  async serviceTypes(): Promise<ServiceTypeRow[]> {
    return check(
      await this.db.from('service_types').select('id, code, name, keywords, no_team').is('archived_at', null).order('code'),
      'serviceTypes',
    ) as ServiceTypeRow[];
  }

  async historyTitles() {
    const rows = await this.all<{ title: string; service_type_id: string }>(
      (a, b) => this.db.from('history_facts').select('title, service_type_id').not('service_type_id', 'is', null).range(a, b),
      'historyTitles',
    );
    const seen = new Set<string>();
    const out: { title: string; serviceTypeId: string }[] = [];
    for (const r of rows) {
      const k = `${r.title}|${r.service_type_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ title: r.title, serviceTypeId: r.service_type_id });
    }
    return out;
  }

  async seriesTypes() {
    const rows = await this.all<{ series: string; service_type_id: string }>(
      (a, b) => this.db.from('series_rules').select('series, service_type_id').not('service_type_id', 'is', null).order('series').range(a, b),
      'seriesTypes',
    );
    return new Map(rows.map((r) => [r.series, r.service_type_id]));
  }

  async secret(name: string): Promise<string | null> {
    return (check(await this.db.rpc('get_secret', { p_name: name }), 'secret') as string | null) ?? null;
  }

  async promoteAiKey(hint: string | null) {
    check(await this.db.rpc('promote_ai_key', { p_hint: hint }), 'promoteAiKey');
  }

  async dropPendingAiKey() {
    check(await this.db.rpc('drop_pending_ai_key'), 'dropPendingAiKey');
  }

  async unclassifiedEvents(fromWeek: string) {
    return check(
      await this.db.from('events').select('id, title').eq('origin', 'calendar').is('service_type_id', null)
        .is('type_source', null).neq('status', 'cancelled').gte('week_start', fromWeek).limit(500),
      'unclassifiedEvents',
    ) as { id: string; title: string }[];
  }

  async setEventType(eventId: string, type: EventType) {
    check(
      await this.db.from('events').update({
        service_type_id: type.service_type_id, type_certainty: type.certainty, type_source: type.source, no_team: type.no_team,
      }).eq('id', eventId).is('type_source', null),
      'setEventType',
    );
  }

  async proposalData(weekId: string): Promise<ProposalData> {
    const week = check(
      await this.db.from('weeks').select('id, week_start, state').eq('id', weekId).single(),
      'proposalData.week',
    ) as ProposalData['week'];
    const ws = week.week_start;
    const weekStart = new Date(`${ws}T00:00:00-03:00`);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
    const [people, events, slots, assignments, absences, jobRoles, serviceTypes, history] = await Promise.all([
      this.all<{ id: string; code: string; active: boolean; weekly_limit_hours: number; person_roles: { job_role_id: string; archived_at: string | null }[] }>(
        (a, b) => this.db.from('people').select('id, code, active, weekly_limit_hours, person_roles(job_role_id, archived_at)').order('id').range(a, b),
        'proposalData.people',
      ),
      this.all<ProposalData['events'][number]>(
        (a, b) => this.db.from('events')
          .select('id, week_start, starts_at, ends_at, all_day, period_start, period_end, status, service_type_id, no_team, ignored')
          .eq('week_start', ws).order('id').range(a, b),
        'proposalData.events',
      ),
      this.all<ProposalData['slots'][number]>(
        (a, b) => this.db.from('slots').select('id, event_id, job_role_id, events!inner(week_start)')
          .eq('events.week_start', ws).is('archived_at', null).order('id').range(a, b),
        'proposalData.slots',
      ),
      this.all<ProposalData['assignments'][number]>(
        (a, b) => this.db.from('assignments').select('slot_id, event_id, person_id, status, locked, events!inner(week_start)')
          .eq('events.week_start', ws).order('id').range(a, b),
        'proposalData.assignments',
      ),
      this.all<ProposalData['absences'][number]>(
        (a, b) => this.db.from('absences').select('person_id, starts_at, ends_at').is('archived_at', null)
          .lt('starts_at', weekEnd.toISOString()).gt('ends_at', weekStart.toISOString()).order('id').range(a, b),
        'proposalData.absences',
      ),
      // "*" e não a lista de colunas: com o banco ainda sem a 0018, no_hours só não vem.
      this.all<{ id: string; code: string; no_hours?: boolean }>((a, b) => this.db.from('job_roles').select('*').order('id').range(a, b), 'proposalData.jobRoles'),
      this.all<{ id: string; code: string; no_team: boolean }>(
        (a, b) => this.db.from('service_types').select('id, code, no_team').order('id').range(a, b),
        'proposalData.serviceTypes',
      ),
      this.all<ProposalData['history'][number]>(
        (a, b) => this.db.from('history_facts').select('person_id, job_role_id, service_type_id').not('person_id', 'is', null).range(a, b),
        'proposalData.history',
      ),
    ]);
    return {
      week,
      people: people.map((p) => ({
        id: p.id, code: p.code, active: p.active, weekly_limit_hours: Number(p.weekly_limit_hours),
        role_ids: p.person_roles.filter((r) => !r.archived_at).map((r) => r.job_role_id),
      })),
      events,
      slots: slots.map(({ id, event_id, job_role_id }) => ({ id, event_id, job_role_id })),
      assignments: assignments.map(({ slot_id, event_id, person_id, status, locked }) => ({ slot_id, event_id, person_id, status, locked })),
      absences,
      jobRoles: jobRoles.map(({ id, code, no_hours }) => ({ id, code, ...(no_hours ? { no_hours } : {}) })),
      serviceTypes,
      history,
    };
  }

  async writeProposals(items: ProposalWrite[]): Promise<number> {
    return check(await this.db.rpc('worker_write_proposals', { p_items: items }), 'writeProposals') as number;
  }

  // Push ----------------------------------------------------------------------------------

  async notification(id: string): Promise<NotificationRow | null> {
    return check(await this.db.from('notifications').select('*').eq('id', id).maybeSingle(), 'notification') as NotificationRow | null;
  }

  async unpushedNotifications(since: Date, limit: number): Promise<NotificationRow[]> {
    return check(
      await this.db.from('notifications').select('*').is('pushed_at', null).gte('created_at', since.toISOString())
        .order('created_at').limit(limit),
      'unpushedNotifications',
    ) as NotificationRow[];
  }

  async personPush(personId: string): Promise<PersonPushRow | null> {
    return check(
      await this.db.from('people').select('id, active, push_enabled, ical_token').eq('id', personId).maybeSingle(),
      'personPush',
    ) as PersonPushRow | null;
  }

  async subscriptions(personId: string): Promise<SubscriptionRow[]> {
    return check(
      await this.db.from('push_subscriptions').select('id, person_id, endpoint, p256dh, auth').eq('person_id', personId).order('id'),
      'subscriptions',
    ) as SubscriptionRow[];
  }

  async deleteSubscription(id: string) {
    check(await this.db.from('push_subscriptions').delete().eq('id', id), 'deleteSubscription');
  }

  async touchSubscription(id: string, at: Date) {
    check(await this.db.from('push_subscriptions').update({ last_ok_at: at.toISOString() }).eq('id', id), 'touchSubscription');
  }

  async markPushed(notificationId: string, at: Date) {
    check(await this.db.from('notifications').update({ pushed_at: at.toISOString() }).eq('id', notificationId), 'markPushed');
  }

  // iCal ----------------------------------------------------------------------------------

  async icalFeed(personId: string, fromWeek: string): Promise<IcalFeed | null> {
    const person = check(
      await this.db.from('people').select('id, name, active, ical_token').eq('id', personId).maybeSingle(),
      'icalFeed.person',
    ) as IcalFeed['person'] | null;
    if (!person) return null;
    // Fotografia corrente das semanas publicadas (ADR-011): nada de rascunho entra no feed.
    const weeks = check(
      await this.db.from('weeks').select('id, revision').eq('state', 'published').gte('week_start', fromWeek),
      'icalFeed.weeks',
    ) as { id: string; revision: number }[];
    type Row = {
      event_id: string; job_role_id: string; person_id: string | null;
      job_roles: { name: string } | null;
      events: {
        title: string; location: string | null; starts_at: string; ends_at: string; all_day: boolean;
        period_start: string | null; period_end: string | null; notes: string | null; status: string; ignored: boolean;
      } | null;
    };
    const items: IcalItem[] = [];
    for (const w of weeks) {
      const rows = check(
        await this.db.from('published_assignments')
          .select('event_id, job_role_id, person_id, job_roles(name), events(title, location, starts_at, ends_at, all_day, period_start, period_end, notes, status, ignored)')
          .eq('week_id', w.id).eq('revision', w.revision),
        'icalFeed.rows',
      ) as unknown as Row[];
      const mine = rows.filter((r) => r.person_id === personId && r.events && r.events.status !== 'cancelled' && !r.events.ignored);
      if (mine.length === 0) continue;
      const otherIds = [...new Set(rows.filter((r) => r.person_id && r.person_id !== personId).map((r) => r.person_id as string))];
      const names = new Map<string, string>();
      if (otherIds.length > 0) {
        const ppl = check(await this.db.from('people').select('id, name').in('id', otherIds), 'icalFeed.names') as { id: string; name: string }[];
        for (const p of ppl) names.set(p.id, p.name);
      }
      for (const r of mine) {
        const e = r.events as NonNullable<Row['events']>;
        const colleagues = rows
          .filter((o) => o.event_id === r.event_id && o.person_id && o.person_id !== personId)
          .map((o) => `${names.get(o.person_id as string) ?? 'Colega'} (${o.job_roles?.name ?? 'função'})`);
        items.push({
          event_id: r.event_id, job_role_id: r.job_role_id, role_name: r.job_roles?.name ?? 'Função',
          title: e.title, location: e.location, starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day,
          period_start: e.period_start, period_end: e.period_end, notes: e.notes, colleagues: [...new Set(colleagues)].sort(),
        });
      }
    }
    return { person, items };
  }

  async clearIcalToken(personId: string) {
    check(await this.db.from('people').update({ ical_token: null }).eq('id', personId), 'clearIcalToken');
  }

  async uploadIcal(token: string, body: string) {
    const { error } = await this.db.storage.from(ICAL_BUCKET).upload(`${token}.ics`, new Blob([body], { type: 'text/calendar' }), {
      contentType: 'text/calendar; charset=utf-8',
      cacheControl: '300',
      upsert: true,
    });
    if (error) throw new Error(`uploadIcal: ${error.message}`);
  }

  async removeIcal(token: string) {
    const { error } = await this.db.storage.from(ICAL_BUCKET).remove([`${token}.ics`]);
    if (error) throw new Error(`removeIcal: ${error.message}`);
  }

  // Auth ----------------------------------------------------------------------------------

  async authPerson(personId: string): Promise<AuthPersonRow | null> {
    return check(
      await this.db.from('people').select('id, email, active, auth_user_id, invite_status').eq('id', personId).maybeSingle(),
      'authPerson',
    ) as AuthPersonRow | null;
  }

  async setInvite(personId: string, patch: { invite_status: AuthPersonRow['invite_status']; auth_user_id?: string }) {
    check(await this.db.from('people').update(patch).eq('id', personId), 'setInvite');
  }
}
