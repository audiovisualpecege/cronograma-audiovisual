// request_job, chave da IA, agenda pessoal, inscrição de push, avisos e configuração.
import { describe, expect, it } from 'vitest';
import { person } from '../helpers/ids.ts';
import {
  applyOne, as, buildWeekB, one, op, rpc, rpcError, service, sql, useSeed,
} from '../helpers/supabase.ts';

const jobsOf = (kind: string) =>
  sql<{ id: string; payload: Record<string, unknown>; requested_by: string; status: string }>(
    'select id, payload, requested_by, status from public.jobs where kind = $1 order by created_at', [kind],
  );

describe('request_job e segredos', () => {
  useSeed();

  it('IT-055 P1 e P2 pedem calendar_sync ao mesmo tempo e recebem o mesmo job_id', async () => {
    const [a, b] = await Promise.all([
      rpc<{ job_id: string }>(as('P1'), 'request_job', { kind: 'calendar_sync', payload: {} }),
      rpc<{ job_id: string }>(as('P2'), 'request_job', { kind: 'calendar_sync', payload: {} }),
    ]);
    expect(a.job_id).toBe(b.job_id);
    expect(await jobsOf('calendar_sync')).toHaveLength(1);
    // Terminada a leitura, um pedido novo cria outro job.
    await sql("update public.jobs set status = 'done'");
    const c = await rpc<{ job_id: string }>(as('P1'), 'request_job', { kind: 'calendar_sync' });
    expect(c.job_id).not.toBe(a.job_id);
  });

  it('IT-056 dois propose da semana B seguidos devolvem o mesmo job_id', async () => {
    const { weekId } = await buildWeekB();
    const a = await rpc<{ job_id: string }>(as('P1'), 'request_job', { kind: 'propose', payload: { week_id: weekId } });
    const b = await rpc<{ job_id: string }>(as('P2'), 'request_job', { kind: 'propose', payload: { week_id: weekId } });
    expect(a.job_id).toBe(b.job_id);
    expect((await jobsOf('propose'))[0]?.payload).toMatchObject({ week_id: weekId });
  });

  it('IT-057 Equipe não pede proposta, mas pede a publicação do próprio feed', async () => {
    const { weekId } = await buildWeekB();
    expect(await rpcError(as('P10'), 'request_job', { kind: 'propose', payload: { week_id: weekId } })).toMatchObject({ code: 'forbidden' });
    expect(await rpcError(as('P10'), 'request_job', { kind: 'auth_ban', payload: { person_id: person(11) } })).toMatchObject({ code: 'forbidden' });
    const res = await rpc<{ job_id: string }>(as('P10'), 'request_job', { kind: 'ical_publish', payload: { person_id: person(11) } });
    expect(res.job_id).toBeTruthy();
    expect(await jobsOf('ical_publish')).toEqual([
      expect.objectContaining({ id: res.job_id, payload: { person_id: person(10) }, requested_by: person(10) }),
    ]);
  });

  it('IT-058 set_ai_key devolve só o hint e private.secrets não é acessível', async () => {
    const key = 'AIzaSyFAKE-chave-de-teste-a1b2';
    const res = await rpc(as('P1'), 'set_ai_key', { provider: 'gemini', key });
    expect(res).toEqual({ hint: '...a1b2' });
    const jobs = await jobsOf('test_ai_key');
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs)).not.toContain(key);
    const { data, error } = await as('P1').schema('private').from('secrets').select('*');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(JSON.stringify(await as('P1').from('settings').select('*'))).not.toContain(key);
    expect(await rpcError(as('P1'), 'get_secret', { p_name: 'ai_key_pending' })).toMatchObject({ sqlstate: '42501' });
    expect(await rpc(service(), 'get_secret', { p_name: 'ai_key_pending' })).toBe(key);
    expect(await rpcError(as('P10'), 'set_ai_key', { provider: 'gemini', key })).toMatchObject({ code: 'forbidden' });
  });

  it('IT-059 agenda pessoal: ligar cria token e job, regenerar troca e revoga o antigo, desligar zera', async () => {
    const tokenOf = async () => (await one<{ ical_token: string | null }>('select ical_token from public.people where id = $1', [person(10)])).ical_token;
    const { data: own } = await as('P10').from('people').select('ical_token');
    expect(own).toEqual([{ ical_token: null }]);

    const on = await rpc<{ url: string; token: string }>(as('P10'), 'set_ical_feed', { enabled: true, regenerate: false });
    const first = await tokenOf();
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(on.url).toBe(`/storage/v1/object/public/ical/${first}.ics`);
    expect(await jobsOf('ical_publish')).toHaveLength(1);

    await sql("update public.jobs set status = 'done'");
    const again = await rpc<{ url: string }>(as('P10'), 'set_ical_feed', { enabled: true, regenerate: true });
    const second = await tokenOf();
    expect(second).not.toBe(first);
    expect(again.url).toContain(second as string);
    expect((await jobsOf('ical_revoke')).map((j) => j.payload)).toEqual([{ person_id: person(10), token: first }]);
    expect(await jobsOf('ical_publish')).toHaveLength(2);

    const off = await rpc(as('P10'), 'set_ical_feed', { enabled: false });
    expect(off).toEqual({ url: null });
    expect(await tokenOf()).toBeNull();
    expect((await jobsOf('ical_revoke')).map((j) => j.payload.token)).toEqual([first, second]);
  });

  it('register_push grava a inscrição do aparelho da própria pessoa', async () => {
    const sub = { endpoint: 'https://push.exemplo.test/abc', expirationTime: null, keys: { p256dh: 'chave', auth: 'segredo' } };
    const res = await rpc<{ id: string }>(as('P10'), 'register_push', sub);
    const again = await rpc<{ id: string }>(as('P10'), 'register_push', sub);
    expect(again.id).toBe(res.id);
    expect(await sql('select person_id, endpoint from public.push_subscriptions')).toEqual([{ person_id: person(10), endpoint: sub.endpoint }]);
    const { data } = await as('P11').from('push_subscriptions').select('*');
    expect(data).toEqual([]);
  });
});

describe('avisos e configuração', () => {
  useSeed();

  it('IT-060 dois avisos com o mesmo (person_id, dedupe_key) resultam em uma linha', async () => {
    const args = { p_person: person(5), p_kind: 'event_changed', p_title: 'Atividade mudou', p_body: 'Local: Estúdio 2', p_link: '#/evento/x', p_dedupe: 'event:x:changed' };
    const a = await rpc<string>(service(), 'notify', args);
    const b = await rpc<string>(service(), 'notify', { ...args, p_body: 'Local: Estúdio 3' });
    expect(b).toBe(a);
    expect(await sql('select body from public.notifications where person_id = $1', [person(5)])).toEqual([{ body: 'Local: Estúdio 3' }]);
    const { error } = await service().from('notifications').insert({
      person_id: person(5), kind: 'event_changed', title: 'Repetido', dedupe_key: 'event:x:changed',
    });
    expect(error?.code).toBe('23505');
    expect(await sql('select * from public.notifications where person_id = $1', [person(5)])).toHaveLength(1);
  });

  it('IT-061 P10 marca o próprio aviso como lido; no de P11 a atualização não afeta nenhuma linha', async () => {
    const [mine] = await sql<{ id: string }>('select id from public.notifications where person_id = $1', [person(10)]);
    const [theirs] = await sql<{ id: string }>('select id from public.notifications where person_id = $1', [person(11)]);
    const now = new Date().toISOString();
    const ok = await as('P10').from('notifications').update({ read_at: now }).eq('id', mine?.id).select('id, read_at');
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    const other = await as('P10').from('notifications').update({ read_at: now }).eq('id', theirs?.id).select('id');
    expect(other.data ?? []).toHaveLength(0);
    expect((await one<{ read_at: Date | null }>('select read_at from public.notifications where id = $1', [theirs?.id])).read_at).toBeNull();
    const title = await as('P10').from('notifications').update({ title: 'trocado' }).eq('id', mine?.id).select('id');
    expect(title.error?.code).toBe('42501');
  });

  it('IT-088 settings.update aceita intervalo de 5 a 120 minutos e recusa 4 e 121', async () => {
    for (const minutes of [4, 121]) {
      const res = await applyOne(as('P1'), op('settings.update', { calendar_poll_minutes: minutes }));
      expect(res).toMatchObject({ status: 'rejected', code: 'invalid_limit' });
    }
    for (const minutes of [5, 120]) {
      const res = await applyOne(as('P1'), op('settings.update', { calendar_poll_minutes: minutes, ai_proposal_enabled: false }));
      expect(res.status).toBe('applied');
      expect(await one('select calendar_poll_minutes, ai_proposal_enabled from public.settings'))
        .toEqual({ calendar_poll_minutes: minutes, ai_proposal_enabled: false });
    }
  });
});
