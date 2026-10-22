// Montagem do serviço de fundo (ADR-006): fila de jobs, agendador, batimento e push, todos falando com o mundo
// só por conexões de saída. Novos jobs e avisos chegam pelo Realtime; a consulta a cada 30 s é a reserva.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Classifier } from './ai/classifier.ts';
import { providerResolver, testAiKey, type LocalDefaults } from './ai/key.ts';
import { ProposalRunner } from './ai/proposal.ts';
import { CallSpacer, paced, type ProviderFactory } from './ai/provider.ts';
import { AuthAdmin, type AuthApi } from './auth/admin.ts';
import type { CalendarApi } from './calendar/google.ts';
import { CalendarSync } from './calendar/sync.ts';
import type { Clock } from './clock.ts';
import { HEARTBEAT_MS, Heartbeat } from './heartbeat.ts';
import { IcalPublisher } from './ical/publisher.ts';
import { errorMessage, type Logger } from './log.ts';
import { Notifier, type PushSender } from './push/notifier.ts';
import { JobQueue, type JobHandler } from './queue.ts';
import { Scheduler, TICK_MS } from './scheduler.ts';
import type { JobKind, NotificationRow, SupabaseStore } from './store.ts';

export interface WorkerDeps {
  db: SupabaseClient;
  store: SupabaseStore;
  clock: Clock;
  log: Logger;
  version: string;
  appUrl: string;
  google: CalendarApi | null;
  providerFactory: ProviderFactory;
  pushSender: PushSender | null;
  authApi: AuthApi;
  /** Espaço entre chamadas à IA; 12 s em produção. */
  aiMinIntervalMs?: number;
  /** Modelo local do .env (AI_LOCAL_URL), quando o banco ainda não tem o endereço. */
  aiLocal?: LocalDefaults | null;
  queuePollMs?: number;
}

const personOf = (payload: Record<string, unknown>) => String(payload.person_id ?? '');

export class Worker {
  readonly queue: JobQueue;
  readonly scheduler: Scheduler;
  readonly heartbeat: Heartbeat;
  readonly notifier: Notifier;
  readonly calendar: CalendarSync;
  readonly classifier: Classifier;
  readonly proposals: ProposalRunner;
  readonly ical: IcalPublisher;
  readonly auth: AuthAdmin;
  private channel: RealtimeChannel | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private inflight = new Set<Promise<unknown>>();
  private stopped = false;

  constructor(private deps: WorkerDeps) {
    const { store, clock, log } = deps;
    const spacer = new CallSpacer(clock, deps.aiMinIntervalMs);
    const providerFor = providerResolver(store, deps.providerFactory, (p) => paced(p, spacer), deps.aiLocal ?? null);
    this.classifier = new Classifier(store, providerFor, log);
    this.calendar = new CalendarSync(store, deps.google, this.classifier, clock, log);
    this.proposals = new ProposalRunner(store, providerFor, clock, log);
    this.ical = new IcalPublisher(store, clock);
    this.auth = new AuthAdmin(store, deps.authApi, deps.appUrl);
    this.notifier = new Notifier(store, deps.pushSender, clock, log);
    this.heartbeat = new Heartbeat(store, clock, log, deps.version);

    const handlers: Record<JobKind, JobHandler> = {
      calendar_sync: () => this.calendar.run(),
      classify: () => this.classifier.classifyPending(clock.now()),
      propose: (job, progress) => this.proposals.run(job.id, job.payload, progress),
      test_ai_key: (job) => testAiKey(store, deps.providerFactory, job.payload, deps.aiLocal ?? null),
      invite: (job) => this.auth.invite(personOf(job.payload)),
      auth_ban: (job) => this.auth.ban(personOf(job.payload), true),
      auth_unban: (job) => this.auth.ban(personOf(job.payload), false),
      ical_publish: (job) => this.ical.publish(personOf(job.payload)),
      ical_revoke: (job) => this.ical.revoke(personOf(job.payload), typeof job.payload.token === 'string' ? job.payload.token : null),
    };
    this.queue = new JobQueue(store, handlers, log);
    this.scheduler = new Scheduler(store, clock, log, {
      onEnqueued: () => this.run(() => this.queue.drain()),
      calendarReady: deps.google !== null,
    });
  }

  async start(): Promise<void> {
    const { store, log, version, db } = this.deps;
    log.info({ version }, 'serviço de fundo iniciado');
    // Jobs que ficaram "running" quando o contêiner parou voltam para a fila.
    const requeued = await store.requeueRunning();
    if (requeued > 0) log.info({ requeued }, 'jobs interrompidos voltaram para a fila');

    this.stopped = false;
    this.channel = db
      .channel('worker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, () => this.run(() => this.queue.drain()))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (msg) => {
        const row = msg.new as Partial<NotificationRow>;
        if (row?.id && !row.pushed_at) this.run(() => this.notifier.deliver(row as NotificationRow), 'falha ao enviar aviso');
      })
      .subscribe((status, err) => log.info({ realtime: status, ...(err ? { error: err.message } : {}) }, 'tempo real'));

    const poll = this.deps.queuePollMs ?? 30_000;
    this.every(HEARTBEAT_MS, () => this.heartbeat.beat());
    this.every(TICK_MS, () => this.scheduler.tick());
    this.every(poll, () => this.queue.drain());
    this.every(poll, () => this.notifier.sweep(), 'reserva do push falhou');
  }

  /** Roda agora e a cada `ms`; o que estiver em curso é esperado no stop(). */
  private every(ms: number, fn: () => Promise<unknown>, onError?: string) {
    this.run(fn, onError);
    this.timers.push(setInterval(() => this.run(fn, onError), ms));
  }

  private run(fn: () => Promise<unknown>, onError = 'tarefa do serviço de fundo falhou') {
    if (this.stopped) return;
    const p = fn()
      .catch((e: unknown) => this.deps.log.warn({ error: errorMessage(e) }, onError))
      .finally(() => this.inflight.delete(p));
    this.inflight.add(p);
  }

  /** Para os temporizadores e o tempo real e espera o trabalho que já tinha começado. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.channel) await this.deps.db.removeChannel(this.channel);
    this.channel = null;
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }
}
