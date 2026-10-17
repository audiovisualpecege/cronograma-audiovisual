import { describe, expect, it } from 'vitest';
import { JobFailure } from '../queue.ts';
import { FakeStore } from '../test/fakeStore.ts';
import { AuthAdmin, AuthError, BAN_FOREVER, createPasswordUrl, type AuthApi } from './admin.ts';

function api(overrides: Partial<AuthApi> = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const base: AuthApi = {
    invite: async (...args) => (calls.push({ fn: 'invite', args }), { userId: 'auth-21' }),
    sendPasswordLink: async (...args) => void calls.push({ fn: 'sendPasswordLink', args }),
    setBan: async (...args) => void calls.push({ fn: 'setBan', args }),
  };
  return { calls, api: { ...base, ...overrides } };
}

function store() {
  const s = new FakeStore();
  s.people.set('p21', { id: 'p21', active: true, push_enabled: true, ical_token: null, email: 'pessoa21@exemplo.test', invite_status: 'pending' });
  return s;
}

const APP = 'https://audiovisualpecege.github.io/cronograma-audiovisual/';

describe('AuthAdmin', () => {
  it('UT-147 convite com redirectTo em #/criar-senha; erro mantém pending e grava o erro no job', async () => {
    const s = store();
    const ok = api();
    expect(await new AuthAdmin(s, ok.api, APP).invite('p21')).toEqual({ sent: true, resent: false });
    expect(ok.calls).toEqual([{ fn: 'invite', args: ['pessoa21@exemplo.test', `${APP}#/criar-senha`] }]);
    expect((ok.calls[0]?.args[1] as string).endsWith('#/criar-senha')).toBe(true);
    expect(s.people.get('p21')).toMatchObject({ invite_status: 'sent', auth_user_id: 'auth-21' });

    const s2 = store();
    const failing = api({ invite: async () => Promise.reject(new AuthError('Error sending invite email', 'unexpected_failure')) });
    const err = await new AuthAdmin(s2, failing.api, APP).invite('p21').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobFailure);
    expect((err as Error).message).toBe('O convite não saiu: Error sending invite email');
    expect(s2.people.get('p21')?.invite_status).toBe('pending');
  });

  it('reenvio para conta que já existe manda o link de criar senha', async () => {
    const s = store();
    Object.assign(s.people.get('p21') as object, { auth_user_id: 'auth-21' });
    const a = api();
    expect(await new AuthAdmin(s, a.api, APP).invite('p21')).toEqual({ sent: true, resent: true });
    expect(a.calls).toEqual([{ fn: 'sendPasswordLink', args: ['pessoa21@exemplo.test', `${APP}#/criar-senha`] }]);
  });

  it('banir e desbanir usam a conta do Auth da pessoa', async () => {
    const s = store();
    Object.assign(s.people.get('p21') as object, { auth_user_id: 'auth-21' });
    const a = api();
    const admin = new AuthAdmin(s, a.api, APP);
    await admin.ban('p21', true);
    await admin.ban('p21', false);
    expect(a.calls).toEqual([
      { fn: 'setBan', args: ['auth-21', BAN_FOREVER] },
      { fn: 'setBan', args: ['auth-21', 'none'] },
    ]);
  });

  it('createPasswordUrl junta a rota ao endereço do app', () => {
    expect(createPasswordUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000/#/criar-senha');
    expect(createPasswordUrl(`${APP}#/painel`)).toBe(`${APP}#/criar-senha`);
  });
});
