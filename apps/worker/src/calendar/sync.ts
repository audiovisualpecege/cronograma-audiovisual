// Releitura das Google Agendas (ADR-003, ADR-007): janela deslizante de 10 semanas (a anterior, a corrente e 8 à
// frente), comparação com o que está guardado por diffCalendarEvent e gravação de cada mudança, com os avisos,
// numa transação no banco. Evento guardado que sumiu da janela é consultado com events.get.
import {
  addDays,
  diffCalendarEvent,
  fingerprint,
  toLocalIso,
  weekStartOf,
  zonedTime,
  type CalendarChange,
  type EventSnapshot,
  type StoredEvent,
} from '@cronograma/core';
import type { Classifier } from '../ai/classifier.ts';
import type { Clock } from '../clock.ts';
import { fmtWhen } from '../format.ts';
import { errorMessage, type Logger } from '../log.ts';
import { JobFailure, type JobResult } from '../queue.ts';
import type { CalendarStore, SourceRow, StoredEventRow } from '../store.ts';
import { GoogleError, type CalendarApi, type CalendarWindow } from './google.ts';

export const WEEKS_BACK = 1;
export const WEEKS_AHEAD = 8;

/** Do início da semana anterior ao fim da 8ª semana depois da corrente, em Brasília. */
export function syncWindow(now: Date): CalendarWindow {
  const ws = weekStartOf(now);
  return {
    timeMin: zonedTime(addDays(ws, -7 * WEEKS_BACK)),
    timeMax: zonedTime(addDays(ws, 7 * (WEEKS_AHEAD + 1))),
  };
}

export function storedEvent(row: StoredEventRow): StoredEvent {
  const snap: EventSnapshot = {
    title: row.title,
    location: row.location,
    description: row.description,
    startsAt: toLocalIso(new Date(row.starts_at)),
    endsAt: toLocalIso(new Date(row.ends_at)),
    allDay: row.all_day,
  };
  return {
    ...snap,
    googleEventId: row.google_event_id,
    weekStart: row.week_start,
    // Evento gravado sem impressão digital (semente, importação) é comparado pelos próprios campos.
    fingerprint: row.fingerprint ?? fingerprint(snap),
    status: row.status,
    changeOriginal: row.change_original,
  };
}

export interface SourceOutcome {
  source_id: string;
  label: string;
  status: SourceRow['status'] | 'disabled';
  events: number;
  events_new: number;
  events_changed: number;
  events_cancelled: number;
  error?: string;
}

export class CalendarSync {
  constructor(
    private store: CalendarStore,
    private google: CalendarApi | null,
    private classifier: Pick<Classifier, 'classify'>,
    private clock: Pick<Clock, 'now'>,
    private log: Logger,
  ) {}

  async run(): Promise<JobResult> {
    const now = this.clock.now();
    const window = syncWindow(now);
    const outcomes: SourceOutcome[] = [];
    let aiCalls = 0;
    let aiQuotaHits = 0;
    for (const src of await this.store.sources()) {
      const base = { source_id: src.id, label: src.label, events: 0, events_new: 0, events_changed: 0, events_cancelled: 0 };
      if (!src.enabled) {
        // Origem removida: não é lida, e os eventos escalados dela ficam com a marca (US-009 AC-2).
        await this.store.markSourceDisconnected(src.id, true);
        outcomes.push({ ...base, status: 'disabled' });
        continue;
      }
      if (!this.google) throw new JobFailure('Conta de serviço do Google não configurada no serviço de fundo.');
      const started = Date.now();
      try {
        const r = await this.syncSource(src, window, now);
        aiCalls += r.aiCalls;
        aiQuotaHits += r.aiQuotaHits;
        outcomes.push(r.outcome);
        this.log.info({ calendar_source_id: src.id, duration_ms: Date.now() - started, ...r.outcome }, 'agenda lida');
      } catch (e) {
        const status = await this.failSource(src, e, now);
        outcomes.push({ ...base, status, error: errorMessage(e) });
        this.log.warn({ calendar_source_id: src.id, status, error: errorMessage(e) }, 'agenda não lida');
      }
    }
    const sum = (k: 'events_new' | 'events_changed' | 'events_cancelled') => outcomes.reduce((n, o) => n + o[k], 0);
    return {
      sources: outcomes,
      events_new: sum('events_new'),
      events_changed: sum('events_changed'),
      events_cancelled: sum('events_cancelled'),
      failed_sources: outcomes.filter((o) => o.error).length,
      ai_calls: aiCalls,
      ai_quota_hits: aiQuotaHits,
    };
  }

  private async syncSource(src: SourceRow, window: CalendarWindow, now: Date) {
    const google = this.google as CalendarApi;
    const calId = src.google_calendar_id;
    // Origem nova ou em erro: confere o acesso antes (ADR-007, na conexão).
    if (src.status !== 'connected') await google.getCalendar(calId);
    const remote = await google.listEvents(calId, window);
    const stored = await this.store.storedEvents(src.id, window.timeMin, window.timeMax);
    const byId = new Map(stored.map((r) => [r.google_event_id, r]));
    // A lista traz eventos que só cruzam a janela (começam antes dela): a linha guardada fica fora da
    // consulta por data, então é buscada pelo id para a comparação valer.
    const outside = remote.filter((r) => !byId.has(r.id)).map((r) => r.id);
    if (outside.length > 0) {
      for (const r of await this.store.storedByGoogleIds(src.id, outside)) byId.set(r.google_event_id, r);
    }

    const changes: { googleId: string; change: CalendarChange }[] = [];
    const seen = new Set<string>();
    for (const r of remote) {
      seen.add(r.id);
      const row = byId.get(r.id);
      const change = diffCalendarEvent(row ? storedEvent(row) : null, r, now);
      if (change.kind !== 'unchanged') changes.push({ googleId: r.id, change });
      else if (row && !row.fingerprint && r.status !== 'cancelled') await this.store.setFingerprint(row.id, storedEvent(row).fingerprint);
    }
    // Sumiu da janela sem vir cancelado: apagado (404/410) ou mudou para fora dela.
    for (const row of stored) {
      if (seen.has(row.google_event_id) || row.status === 'cancelled') continue;
      const r = await google.getEvent(calId, row.google_event_id);
      const change = diffCalendarEvent(storedEvent(row), r, now);
      if (change.kind !== 'unchanged') changes.push({ googleId: row.google_event_id, change });
    }

    const fresh = changes.filter((c) => c.change.kind === 'new');
    const classified = await this.classifier.classify(
      fresh.map((c) => ({ id: c.googleId, title: c.change.kind === 'new' ? c.change.after.title : '' })),
    );
    const outcome: SourceOutcome = {
      source_id: src.id, label: src.label, status: 'connected',
      events: remote.filter((r) => r.status !== 'cancelled').length,
      events_new: 0, events_changed: 0, events_cancelled: 0,
    };
    for (const { googleId, change } of changes) {
      await this.store.applyCalendarChange(src.id, googleId, change, change.kind === 'new' ? (classified.types.get(googleId) ?? null) : null);
      if (change.kind === 'new' || change.kind === 'restored') outcome.events_new++;
      else if (change.kind === 'cancelled') outcome.events_cancelled++;
      else outcome.events_changed++;
    }
    // Cor do Google: a do evento (colorId) muda sem mudar o evento, então é gravada à parte, só onde mudou.
    const colors = new Map<string | null, string[]>();
    for (const r of remote) {
      if (r.status === 'cancelled') continue;
      const color = r.colorId ?? null;
      const row = byId.get(r.id);
      if (row ? (row.color_id ?? null) === color : color === null) continue;
      colors.set(color, [...(colors.get(color) ?? []), r.id]);
    }
    if (colors.size > 0) await this.store.setEventColors(src.id, colors);
    await this.store.updateSource(src.id, { status: 'connected', last_synced_at: now.toISOString(), last_error: null });
    await this.store.markSourceDisconnected(src.id, false);
    return { outcome, aiCalls: classified.aiCalls, aiQuotaHits: classified.aiQuotaHits };
  }

  /**
   * 401, 403 e 404: a origem fica em erro e os administradores recebem o alerta na primeira falha (US-009 EC-2).
   * 5xx, rede e o resto: dados mantidos, só last_error, nova tentativa no próximo intervalo (US-011 EC-4).
   */
  private async failSource(src: SourceRow, e: unknown, now: Date): Promise<SourceRow['status']> {
    const message = errorMessage(e);
    if (e instanceof GoogleError && e.isAuth) {
      await this.store.updateSource(src.id, { status: 'error', last_error: message });
      await this.store.markSourceDisconnected(src.id, true);
      if (src.status !== 'error') {
        await this.store.notifyAdmins({
          kind: 'calendar_disconnected',
          title: `Agenda ${src.label} desconectada desde ${fmtWhen(now)}`,
          body: `${message} Confira se a agenda continua compartilhada com a conta de serviço; a plataforma segue com os últimos dados lidos.`,
          link: '#/admin/configuracao',
          dedupe: `calendar:error:${src.id}:${now.toISOString()}`,
        });
      }
      return 'error';
    }
    await this.store.updateSource(src.id, { last_error: message });
    return src.status;
  }
}
