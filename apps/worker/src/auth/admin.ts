// Contas no Supabase Auth (US-002, US-003): convite com link para criar a senha, reenvio, banimento ao
// desativar e fim do banimento ao reativar. Só a service_role faz isso, por isso mora no worker.
import type { SupabaseClient } from '@supabase/supabase-js';
import { JobFailure, type JobResult } from '../queue.ts';
import type { AuthStore } from '../store.ts';

/** Banimento sem prazo prático (100 anos); 'none' tira. */
export const BAN_FOREVER = '876000h';

export interface AuthApi {
  /** Convida e devolve o id da conta criada. */
  invite(email: string, redirectTo: string): Promise<{ userId: string }>;
  /** E-mail para definir a senha de uma conta que já existe (convite expirado ou reenviado). */
  sendPasswordLink(email: string, redirectTo: string): Promise<void>;
  setBan(userId: string, duration: string): Promise<void>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string | null = null,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function supabaseAuthApi(db: SupabaseClient): AuthApi {
  return {
    async invite(email, redirectTo) {
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error || !data.user) throw new AuthError(error?.message ?? 'Convite sem conta criada.', error?.code ?? null);
      return { userId: data.user.id };
    },
    async sendPasswordLink(email, redirectTo) {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new AuthError(error.message, error.code ?? null);
    },
    async setBan(userId, duration) {
      const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: duration });
      if (error) throw new AuthError(error.message, error.code ?? null);
    },
  };
}

/** `https://.../app/` + `#/criar-senha`, a tela onde a pessoa cria a senha. */
export function createPasswordUrl(appUrl: string): string {
  return `${appUrl.replace(/#.*$/, '').replace(/\/?$/, '/')}#/criar-senha`;
}

export class AuthAdmin {
  constructor(
    private store: AuthStore,
    private api: AuthApi,
    private appUrl: string,
  ) {}

  async invite(personId: string): Promise<JobResult> {
    const p = await this.store.authPerson(personId);
    if (!p || !p.active || !p.email) throw new JobFailure('Pessoa não encontrada, inativa ou sem e-mail.');
    const redirectTo = createPasswordUrl(this.appUrl);
    try {
      if (p.auth_user_id) {
        // Conta já existe (convite expirado ou pedido de reenvio): manda o link de criar senha de novo.
        await this.api.sendPasswordLink(p.email, redirectTo);
        await this.store.setInvite(p.id, { invite_status: p.invite_status === 'accepted' ? 'accepted' : 'sent' });
        return { sent: true, resent: true };
      }
      try {
        const { userId } = await this.api.invite(p.email, redirectTo);
        await this.store.setInvite(p.id, { invite_status: 'sent', auth_user_id: userId });
        return { sent: true, resent: false };
      } catch (e) {
        if (!(e instanceof AuthError && e.code === 'email_exists')) throw e;
        await this.api.sendPasswordLink(p.email, redirectTo);
        await this.store.setInvite(p.id, { invite_status: 'sent' });
        return { sent: true, resent: true };
      }
    } catch (e) {
      // O convite fica pendente e o botão "Reenviar convite" continua no cadastro (US-002 EC-6).
      throw new JobFailure(`O convite não saiu: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async ban(personId: string, banned: boolean): Promise<JobResult> {
    const p = await this.store.authPerson(personId);
    if (!p) throw new JobFailure('Pessoa não encontrada.');
    if (!p.auth_user_id) return { skipped: true };
    await this.api.setBan(p.auth_user_id, banned ? BAN_FOREVER : 'none');
    return { banned };
  }
}
