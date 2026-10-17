// Fila `jobs` (ADR-006): os aparelhos pedem, o worker reivindica um job de cada vez e grava o resultado.
// A reivindicação é um UPDATE condicional (queued -> running), então dois consumidores nunca pegam o mesmo.
import { errorMessage, type Logger } from './log.ts';
import type { JobKind, JobRow, QueueStore } from './store.ts';

export type JobResult = Record<string, unknown>;

/** Erro que vira `jobs.error` com um texto para a pessoa, sem ser tratado como falha inesperada. */
export class JobFailure extends Error {
  constructor(
    message: string,
    public result: JobResult | null = null,
  ) {
    super(message);
    this.name = 'JobFailure';
  }
}

export type JobHandler = (job: JobRow, progress: (result: JobResult) => Promise<void>) => Promise<JobResult>;

export class JobQueue {
  private running = false;
  private again = false;

  constructor(
    private store: QueueStore,
    private handlers: Partial<Record<JobKind, JobHandler>>,
    private log: Logger,
  ) {}

  /** Reivindica o job; nulo quando outro já pegou ou ele não está mais na fila. */
  claim(id: string): Promise<JobRow | null> {
    return this.store.claimJob(id);
  }

  /** Executa um job já reivindicado e grava `done` ou `failed`. */
  async run(job: JobRow): Promise<JobRow['status']> {
    const started = Date.now();
    const handler = this.handlers[job.kind];
    let status: 'done' | 'failed' = 'done';
    let result: JobResult | null;
    let error: string | null = null;
    try {
      if (!handler) throw new JobFailure(`Tipo de pedido sem tratamento: ${job.kind}`);
      result = await handler(job, (r) => this.store.saveJobResult(job.id, r));
    } catch (e) {
      status = 'failed';
      error = errorMessage(e);
      result = e instanceof JobFailure ? e.result : null;
      if (!(e instanceof JobFailure)) this.log.error({ job_id: job.id, kind: job.kind, err: e }, 'job com erro inesperado');
    }
    await this.store.finishJob(job.id, { status, result, error });
    this.log.info(
      { job_id: job.id, kind: job.kind, status, duration_ms: Date.now() - started, ...(error ? { error } : {}), ...summary(result) },
      'job terminado',
    );
    return status;
  }

  /** Esvazia a fila em ordem de chegada; chamadas durante a execução fazem mais uma volta no fim. */
  async drain(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.again = false;
        for (;;) {
          const [next] = await this.store.queuedJobs(1);
          if (!next) break;
          const job = await this.claim(next.id);
          if (job) await this.run(job);
        }
      } while (this.again);
    } catch (e) {
      this.log.error({ err: e }, 'falha ao ler a fila');
    } finally {
      this.running = false;
    }
  }
}

// Só os contadores entram no log (eventos novos, chamadas à IA, envios...), nunca listas ou textos.
function summary(result: JobResult | null): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(result ?? {})) {
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}
