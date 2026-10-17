// Web Push dos avisos (US-023): cada aviso novo ou atualizado vai para todos os aparelhos inscritos da pessoa,
// com `tag` igual ao dedupe_key (o aparelho troca a notificação em vez de empilhar). Respeita o liga e desliga
// da pessoa e o geral; sem janela de silêncio, o aparelho cuida disso (EC-5). 404 e 410 apagam a inscrição.
import webpush from 'web-push';
import type { Clock } from '../clock.ts';
import { errorMessage, type Logger } from '../log.ts';
import type { NotificationRow, PushStore, SubscriptionRow } from '../store.ts';

export interface PushPayload {
  title: string;
  body: string;
  link: string;
  tag: string;
  id: string;
}

export type PushSender = (sub: SubscriptionRow, payload: PushPayload) => Promise<void>;

/** Avisos que mudam a escala ou a agenda de alguém regeram o feed iCal dessa pessoa. */
export const ICAL_KINDS = new Set(['week_published', 'week_changed', 'event_changed', 'event_cancelled']);

export function webPushSender(vapid: { publicKey: string; privateKey: string; subject: string }): PushSender {
  return async (sub, payload) => {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { vapidDetails: vapid, TTL: 24 * 3600, urgency: 'high', topic: topicOf(payload.tag) },
    );
  };
}

// Topic do Web Push: até 32 caracteres do alfabeto URL-safe; o serviço substitui a mensagem pendente igual.
function topicOf(tag: string): string {
  return Buffer.from(tag).toString('base64url').slice(-32);
}

function statusOf(e: unknown): number | null {
  const s = (e as { statusCode?: unknown })?.statusCode;
  return typeof s === 'number' ? s : null;
}

export interface NotifyOutcome {
  push_sent: number;
  push_gone: number;
  /** Envios que falharam de forma passageira. */
  failed?: number;
  skipped?: 'person_off' | 'global_off' | 'no_subscription' | 'inactive';
}

/** Tentativas de um mesmo aviso quando o serviço de push falha de forma passageira (5xx, rede). */
export const PUSH_ATTEMPTS = 3;

export class Notifier {
  /** Versão de cada aviso já tratada, para não reenviar a mesma coisa (Realtime e consulta de reserva). */
  private handled = new Map<string, number>();
  private attempts = new Map<string, number>();

  constructor(
    private store: PushStore,
    private send: PushSender | null,
    private clock: Pick<Clock, 'now'>,
    private log: Logger,
  ) {}

  async deliver(n: NotificationRow): Promise<NotifyOutcome> {
    if (this.handled.get(n.id) === n.version || n.pushed_at) return { push_sent: 0, push_gone: 0 };
    this.handled.set(n.id, n.version);
    const key = `${n.id}:${n.version}`;
    const attempt = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, attempt);
    let out: NotifyOutcome;
    try {
      out = await this.deliverOnce(n, attempt === 1);
    } catch (e) {
      // Falha do banco no meio do caminho: a varredura seguinte tenta de novo.
      this.handled.delete(n.id);
      throw e;
    }
    // Nenhum aparelho recebeu por falha passageira: a varredura seguinte tenta de novo, até o limite.
    if (out.failed && out.push_sent === 0 && attempt < PUSH_ATTEMPTS) this.handled.delete(n.id);
    return out;
  }

  private async deliverOnce(n: NotificationRow, first: boolean): Promise<NotifyOutcome> {
    const out: NotifyOutcome = { push_sent: 0, push_gone: 0 };
    const person = await this.store.personPush(n.person_id);
    if (first && person?.ical_token && person.active && ICAL_KINDS.has(n.kind)) {
      await this.store.enqueueJob('ical_publish', { person_id: n.person_id }, n.person_id);
    }
    if (!person?.active) return { ...out, skipped: 'inactive' };
    if (!person.push_enabled) return { ...out, skipped: 'person_off' };
    if (!(await this.store.settings()).push_enabled_global) return { ...out, skipped: 'global_off' };
    const subs = await this.store.subscriptions(n.person_id);
    if (subs.length === 0 || !this.send) return { ...out, skipped: 'no_subscription' };

    const payload: PushPayload = { title: n.title, body: n.body ?? '', link: n.link ?? '#/', tag: n.dedupe_key, id: n.id };
    for (const sub of subs) {
      try {
        await this.send(sub, payload);
        out.push_sent++;
        await this.store.touchSubscription(sub.id, this.clock.now());
      } catch (e) {
        const status = statusOf(e);
        if (status === 404 || status === 410) {
          // Inscrição perdida (comum no iPhone): o app pede para reativar ao abrir (US-023 EC-3).
          await this.store.deleteSubscription(sub.id);
          out.push_gone++;
        } else {
          out.failed = (out.failed ?? 0) + 1;
          this.log.warn({ notification_id: n.id, status, error: errorMessage(e) }, 'push não entregue');
        }
      }
    }
    if (out.push_sent > 0) await this.store.markPushed(n.id, this.clock.now());
    this.log.info({ notification_id: n.id, kind: n.kind, ...out }, 'aviso enviado');
    return out;
  }

  async deliverById(id: string): Promise<NotifyOutcome | null> {
    const n = await this.store.notification(id);
    return n ? this.deliver(n) : null;
  }

  /**
   * Reserva do Realtime: avisos das últimas 24 h ainda sem push. created_at é a hora real do banco, por isso
   * a conta usa a hora real, não o relógio das regras.
   */
  async sweep(): Promise<number> {
    const since = new Date(Date.now() - 24 * 3_600_000);
    let sent = 0;
    for (const n of await this.store.unpushedNotifications(since, 200)) {
      try {
        sent += (await this.deliver(n)).push_sent;
      } catch (e) {
        this.log.warn({ notification_id: n.id, error: errorMessage(e) }, 'falha ao enviar aviso');
      }
    }
    if (this.handled.size > 5000) {
      this.handled.clear();
      this.attempts.clear();
    }
    return sent;
  }
}
