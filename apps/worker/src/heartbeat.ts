// Batimento: grava settings.worker_seen_at a cada minuto; os administradores veem "Serviço de fundo parado
// desde ..." depois de 5 minutos sem ele. Também mantém o projeto Supabase gratuito ativo.
import type { Clock } from './clock.ts';
import { errorMessage, type Logger } from './log.ts';
import type { HeartbeatStore } from './store.ts';

export const HEARTBEAT_MS = 60_000;

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: HeartbeatStore,
    private clock: Pick<Clock, 'now'>,
    private log: Logger,
    private version: string,
  ) {}

  async beat(): Promise<void> {
    try {
      await this.store.touchWorkerSeen(this.clock.now());
      this.log.info({ version: this.version }, 'batimento');
    } catch (e) {
      this.log.warn({ version: this.version, error: errorMessage(e) }, 'batimento falhou');
    }
  }

  start(): void {
    void this.beat();
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
