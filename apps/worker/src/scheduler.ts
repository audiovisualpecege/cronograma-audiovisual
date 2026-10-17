// Agendador interno (ADR-006): releitura da agenda no intervalo de settings.calendar_poll_minutes, lembrete
// de alterações não publicadas, alerta de agenda sem leitura, situação dos convites e limpeza dos avisos.
// Cada automação obedece ao seu liga e desliga em settings.
import { weekStartOf } from '@cronograma/core';
import { cleanupNotifications } from './cleanup.ts';
import type { Clock } from './clock.ts';
import { fmtDay, fmtWhen } from './format.ts';
import { errorMessage, type Logger } from './log.ts';
import type { CleanupStore, SchedulerStore } from './store.ts';

export const TICK_MS = 60_000;
/** Alterações esquecidas por mais de 2 horas na semana corrente (US-018 EC-3). */
export const REMINDER_MS = 2 * 3_600_000;
/** A última leitura boa passou de 3 intervalos (Monitoring and Observability). */
export const STALE_INTERVALS = 3;
const CLEANUP_MS = 3_600_000;
const INVITES_MS = 5 * 60_000;

export interface SchedulerHooks {
  /** Chamado depois de criar um job, para a fila andar sem esperar o Realtime. */
  onEnqueued?: () => void;
  /** Falso quando o NAS ainda não tem a conta de serviço do Google: não há releitura automática. */
  calendarReady?: boolean;
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSync: number | null = null;
  private lastCleanup: number | null = null;
  private lastInvites: number | null = null;

  constructor(
    private store: SchedulerStore & CleanupStore,
    private clock: Pick<Clock, 'now'>,
    private log: Logger,
    private hooks: SchedulerHooks = {},
  ) {}

  async tick(): Promise<void> {
    const now = this.clock.now();
    const steps: [string, () => Promise<unknown>][] = [
      ['releitura', () => this.pollCalendar(now)],
      ['lembrete', () => this.remindUnpublished(now)],
      ['agenda parada', () => this.alertStaleSources(now)],
      ['convites', () => this.syncInvites(now)],
      ['limpeza', () => this.cleanup(now)],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (e) {
        this.log.warn({ step: name, error: errorMessage(e) }, 'passo do agendador falhou');
      }
    }
  }

  async pollCalendar(now: Date): Promise<boolean> {
    if (this.hooks.calendarReady === false) return false;
    const s = await this.store.settings();
    if (!s.calendar_poll_enabled) return false;
    const every = s.calendar_poll_minutes * 60_000;
    if (this.lastSync !== null && now.getTime() - this.lastSync < every) return false;
    await this.store.enqueueJob('calendar_sync', {}, 'all');
    this.lastSync = now.getTime();
    this.hooks.onEnqueued?.();
    return true;
  }

  /** Um lembrete por semana e por início de pendência, só na semana corrente. */
  async remindUnpublished(now: Date): Promise<number> {
    const current = weekStartOf(now);
    let sent = 0;
    for (const w of await this.store.dirtyPublishedWeeks()) {
      if (w.week_start !== current) continue;
      if (now.getTime() - new Date(w.dirty_since).getTime() < REMINDER_MS) continue;
      await this.store.notifyAdmins({
        kind: 'unpublished_changes',
        title: 'Alterações não publicadas',
        body: `A semana de ${fmtDay(w.week_start)} tem alterações não publicadas há mais de 2 horas. Publique ou descarte.`,
        link: '#/painel',
        dedupe: `unpublished:${w.id}:${new Date(w.dirty_since).toISOString()}`,
        once: true,
      });
      sent++;
    }
    return sent;
  }

  async alertStaleSources(now: Date): Promise<number> {
    const s = await this.store.settings();
    if (!s.calendar_poll_enabled) return 0;
    const limit = STALE_INTERVALS * s.calendar_poll_minutes * 60_000;
    let sent = 0;
    for (const src of await this.store.sources()) {
      if (!src.enabled || src.status !== 'connected' || !src.last_synced_at) continue;
      const last = new Date(src.last_synced_at);
      if (now.getTime() - last.getTime() <= limit) continue;
      await this.store.notifyAdmins({
        kind: 'calendar_stale',
        title: `Agenda ${src.label} sem leitura desde ${fmtWhen(last)}`,
        body: 'A releitura automática não está conseguindo ler esta agenda. Confira se o serviço de fundo está ligado.',
        link: '#/admin/configuracao',
        dedupe: `calendar:stale:${src.id}:${src.last_synced_at}`,
        once: true,
      });
      sent++;
    }
    return sent;
  }

  private async syncInvites(now: Date) {
    if (this.lastInvites !== null && now.getTime() - this.lastInvites < INVITES_MS) return;
    this.lastInvites = now.getTime();
    await this.store.syncInviteStatus();
  }

  private async cleanup(now: Date) {
    if (this.lastCleanup !== null && now.getTime() - this.lastCleanup < CLEANUP_MS) return;
    this.lastCleanup = now.getTime();
    const removed = await cleanupNotifications(this.store, now);
    if (removed > 0) this.log.info({ removed }, 'avisos antigos apagados');
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
