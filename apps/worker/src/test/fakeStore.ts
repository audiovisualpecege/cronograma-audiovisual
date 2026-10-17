// Armazenamento em memória com as mesmas portas do SupabaseStore, para os testes de unidade.
import type { CalendarChange } from '@cronograma/core';
import type {
  AuthPersonRow, EventType, IcalFeed, JobKind, JobRow, Notice, NotificationRow, PersonPushRow, ProposalData,
  ProposalWrite, ServiceTypeRow, SettingsRow, SourceRow, StoredEventRow, SubscriptionRow,
} from '../store.ts';

export const DEFAULT_SETTINGS: SettingsRow = {
  calendar_poll_enabled: true,
  calendar_poll_minutes: 15,
  ai_proposal_enabled: true,
  ai_classification_enabled: true,
  ai_provider: 'gemini',
  ai_model: 'gemini-2.5-flash',
  push_enabled_global: true,
};

export class FakeStore {
  settingsRow: SettingsRow = { ...DEFAULT_SETTINGS };
  workerSeen: Date[] = [];
  jobs: JobRow[] = [];
  enqueued: { kind: JobKind; payload: Record<string, unknown>; dedupe: string | null }[] = [];
  notices: Notice[] = [];
  dirtyWeeks: { id: string; week_start: string; dirty_since: string }[] = [];
  deletedBefore: Date[] = [];
  inviteSyncs = 0;

  sourceRows: SourceRow[] = [];
  stored: (StoredEventRow & { calendar_source_id: string })[] = [];
  applied: { sourceId: string; googleId: string; change: CalendarChange; type: EventType | null }[] = [];
  disconnected: { sourceId: string; flag: boolean }[] = [];

  types: ServiceTypeRow[] = [];
  titles: { title: string; serviceTypeId: string }[] = [];
  secrets = new Map<string, string>();
  typed = new Map<string, EventType>();
  unclassified: { id: string; title: string }[] = [];
  promoted: (string | null)[] = [];

  proposal: ProposalData | null = null;
  writes: ProposalWrite[][] = [];

  notifications: NotificationRow[] = [];
  people = new Map<string, PersonPushRow & Partial<AuthPersonRow>>();
  subs: SubscriptionRow[] = [];
  pushed = new Map<string, Date>();

  feeds = new Map<string, IcalFeed>();
  uploads = new Map<string, string>();
  removed: string[] = [];

  // Fila
  async claimJob(id: string) {
    const j = this.jobs.find((x) => x.id === id && x.status === 'queued');
    if (!j) return null;
    j.status = 'running';
    return { ...j };
  }
  async queuedJobs(limit: number) {
    return this.jobs.filter((j) => j.status === 'queued').slice(0, limit);
  }
  async finishJob(id: string, patch: { status: 'done' | 'failed'; result?: Record<string, unknown> | null; error?: string | null }) {
    Object.assign(this.jobs.find((j) => j.id === id) ?? {}, patch);
  }
  async saveJobResult(id: string, result: Record<string, unknown>) {
    Object.assign(this.jobs.find((j) => j.id === id) ?? {}, { result });
  }
  async requeueRunning() {
    let n = 0;
    for (const j of this.jobs) {
      if (j.status !== 'running') continue;
      j.status = 'queued';
      n++;
    }
    return n;
  }

  // Configuração, agendador
  async settings() {
    return { ...this.settingsRow };
  }
  async touchWorkerSeen(at: Date) {
    this.workerSeen.push(at);
  }
  async enqueueJob(kind: JobKind, payload: Record<string, unknown>, dedupe: string | null) {
    this.enqueued.push({ kind, payload, dedupe });
    return `job-${this.enqueued.length}`;
  }
  async dirtyPublishedWeeks() {
    return this.dirtyWeeks;
  }
  async syncInviteStatus() {
    return this.inviteSyncs++;
  }
  async notifyAdmins(n: Notice) {
    if (n.once && this.notices.some((x) => x.dedupe === n.dedupe)) return 0;
    this.notices.push(n);
    return 2;
  }
  async deleteNotificationsBefore(at: Date) {
    this.deletedBefore.push(at);
    const before = this.notifications.length;
    this.notifications = this.notifications.filter((n) => new Date(n.created_at) >= at);
    return before - this.notifications.length;
  }

  // Agenda
  async sources() {
    return this.sourceRows.map((s) => ({ ...s }));
  }
  async storedEvents(sourceId: string, from: Date, to: Date) {
    return this.stored.filter(
      (e) => e.calendar_source_id === sourceId && new Date(e.starts_at) >= from && new Date(e.starts_at) < to,
    );
  }
  async storedByGoogleIds(sourceId: string, ids: string[]) {
    return this.stored.filter((e) => e.calendar_source_id === sourceId && ids.includes(e.google_event_id));
  }
  async updateSource(id: string, patch: Partial<SourceRow>) {
    Object.assign(this.sourceRows.find((s) => s.id === id) ?? {}, patch);
  }
  async applyCalendarChange(sourceId: string, googleId: string, change: CalendarChange, type: EventType | null) {
    this.applied.push({ sourceId, googleId, change, type });
  }
  async markSourceDisconnected(sourceId: string, flag: boolean) {
    this.disconnected.push({ sourceId, flag });
  }
  async setFingerprint() {}

  // Classificação e IA
  async serviceTypes() {
    return this.types;
  }
  async historyTitles() {
    return this.titles;
  }
  async secret(name: string) {
    return this.secrets.get(name) ?? null;
  }
  async promoteAiKey(hint: string | null) {
    this.promoted.push(hint);
    const k = this.secrets.get('ai_key_pending');
    if (k) this.secrets.set('ai_key', k);
    this.secrets.delete('ai_key_pending');
  }
  async dropPendingAiKey() {
    this.secrets.delete('ai_key_pending');
  }
  async unclassifiedEvents() {
    return this.unclassified;
  }
  async setEventType(id: string, type: EventType) {
    this.typed.set(id, type);
  }
  async proposalData() {
    if (!this.proposal) throw new Error('sem dados da semana');
    return this.proposal;
  }
  async writeProposals(items: ProposalWrite[]) {
    this.writes.push(items);
    return items.length;
  }

  // Push
  async notification(id: string) {
    return this.notifications.find((n) => n.id === id) ?? null;
  }
  async unpushedNotifications(since: Date) {
    return this.notifications.filter((n) => !n.pushed_at && new Date(n.created_at) >= since);
  }
  async personPush(id: string) {
    return this.people.get(id) ?? null;
  }
  async subscriptions(personId: string) {
    return this.subs.filter((s) => s.person_id === personId);
  }
  async deleteSubscription(id: string) {
    this.subs = this.subs.filter((s) => s.id !== id);
  }
  async touchSubscription() {}
  async markPushed(id: string, at: Date) {
    this.pushed.set(id, at);
    const n = this.notifications.find((x) => x.id === id);
    if (n) n.pushed_at = at.toISOString();
  }

  // iCal
  async icalFeed(personId: string) {
    return this.feeds.get(personId) ?? null;
  }
  async clearIcalToken(personId: string) {
    const f = this.feeds.get(personId);
    if (f) f.person.ical_token = null;
  }
  async uploadIcal(token: string, body: string) {
    this.uploads.set(token, body);
  }
  async removeIcal(token: string) {
    this.removed.push(token);
    this.uploads.delete(token);
  }

  // Auth
  async authPerson(id: string) {
    const p = this.people.get(id);
    return p ? ({ id, email: p.email ?? null, active: p.active, auth_user_id: p.auth_user_id ?? null, invite_status: p.invite_status ?? 'pending' } as AuthPersonRow) : null;
  }
  async setInvite(id: string, patch: { invite_status: AuthPersonRow['invite_status']; auth_user_id?: string }) {
    Object.assign(this.people.get(id) ?? {}, patch);
  }
}
