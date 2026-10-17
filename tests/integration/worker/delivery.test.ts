// Push, feed iCal, convites e banimento no Auth e limpeza de avisos, com o worker real.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, inject, it } from 'vitest';
import { cleanupNotifications } from '../../../apps/worker/src/cleanup.ts';
import { EVENT, WEEK_A, email, person } from '../helpers/ids.ts';
import { anon, applyOne, as, buildWeekB, one, op, rpc, slotOf, sql, useSeed } from '../helpers/supabase.ts';
import { APP_URL, clearMail, mailTo, push, runJob, until, useWorker } from './harness.ts';

const env = () => inject('supabase');

/** O Storage responde 400 com `statusCode: "404"` no corpo quando o arquivo não existe. */
async function gone(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { statusCode?: string; error?: string };
  return !res.ok && body.statusCode === '404' && body.error === 'not_found';
}
const feedUrl = (token: string) => `${env().apiUrl}/storage/v1/object/public/ical/${token}.ics`;
const tokenOf = async (n: number) =>
  (await one<{ ical_token: string | null }>('select ical_token from public.people where id = $1', [person(n)])).ical_token;

describe('push, iCal, convites e limpeza', () => {
  useSeed();
  const ctx = useWorker();

  it('IT-078 aviso para P5 com inscrição registrada chega ao endpoint com title, body e link e grava pushed_at', async () => {
    const device = push.device('p5-celular');
    await rpc(as('P5'), 'register_push', { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth }, userAgent: 'Pixel 7' });
    await sql('update public.settings set calendar_poll_enabled = false');
    await ctx.worker.start();
    const { id } = await one<{ id: string }>(
      `select public.notify($1, 'week_changed', 'Sua semana de 19/10 mudou', 'Entrou: Gravação aula Matemática (Câmera), 22/10 14:00',
        '#/minha-semana/2026-10-19', 'teste:it-078') as id`,
      [person(5)],
    );
    const received = await until(() => Promise.resolve(push.received[0]), 'push no endpoint simulado');
    expect(received).toMatchObject({
      endpoint: device.endpoint,
      payload: {
        id, title: 'Sua semana de 19/10 mudou', body: 'Entrou: Gravação aula Matemática (Câmera), 22/10 14:00',
        link: '#/minha-semana/2026-10-19', tag: 'teste:it-078',
      },
    });
    const row = await until(
      async () => (await one<{ pushed_at: Date | null }>('select pushed_at from public.notifications where id = $1', [id])).pushed_at,
      'pushed_at gravado',
    );
    expect(row).toBeInstanceOf(Date);
    expect((await one<{ last_ok_at: Date | null }>('select last_ok_at from public.push_subscriptions where endpoint = $1', [device.endpoint])).last_ok_at).not.toBeNull();
  });

  it('IT-079 o feed de P5 traz as atividades publicadas; alteração não publicada não entra; cancelada some', async () => {
    const { token } = await rpc<{ token: string }>(as('P5'), 'set_ical_feed', { enabled: true, regenerate: false });
    await ctx.worker.queue.drain();
    const { weekId } = await buildWeekB();
    const b1 = await slotOf(EVENT.B1, 'R1');
    const b2 = await slotOf(EVENT.B2, 'R1');
    expect((await applyOne(as('P1'), op('assignment.set', { slot_id: b1, person_id: person(5) }))).status).toBe('applied');
    await rpc(as('P1'), 'publish_week', { week_id: weekId, expected_revision: 0 });
    // O aviso da publicação acorda o push, que pede a regeração do feed de P5.
    await ctx.worker.notifier.sweep();
    await ctx.worker.queue.drain();

    let res = await fetch(feedUrl(token));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    let ics = (await res.text()).replace(/\r\n /g, '');
    expect(ics).toContain('SUMMARY:Gravação aula Matemática (Câmera)');
    expect(ics).toContain('SUMMARY:Gravação aula Biologia (Câmera)');
    expect(ics).not.toContain('Química');

    // Alteração não publicada: P5 entra no B2, mas a semana não é republicada.
    expect((await applyOne(as('P1'), op('assignment.set', { slot_id: b2, person_id: person(5) }))).status).toBe('applied');
    await runJob(ctx.worker, 'ical_publish', { person_id: person(5) });
    ics = (await (await fetch(feedUrl(token), { cache: 'no-store' })).text()).replace(/\r\n /g, '');
    expect(ics).not.toContain('Química');

    // Atividade cancelada some.
    await sql("update public.events set status = 'cancelled' where id = $1", [EVENT.E1]);
    await runJob(ctx.worker, 'ical_publish', { person_id: person(5) });
    res = await fetch(feedUrl(token), { cache: 'no-store' });
    ics = (await res.text()).replace(/\r\n /g, '');
    expect(ics).not.toContain('Matemática');
    expect(ics).toContain('Biologia');
    expect(WEEK_A.start).toBe('2026-10-19');
  });

  it('IT-080 token antigo dá 404 depois de regenerar; pessoa desativada dá 404; o URL não abre tabela nenhuma', async () => {
    await rpc(as('P5'), 'set_ical_feed', { enabled: true, regenerate: false });
    await ctx.worker.queue.drain();
    const first = (await tokenOf(5)) as string;
    expect((await fetch(feedUrl(first))).status).toBe(200);

    await rpc(as('P5'), 'set_ical_feed', { enabled: true, regenerate: true });
    await ctx.worker.queue.drain();
    const second = (await tokenOf(5)) as string;
    expect(second).not.toBe(first);
    expect(await gone(feedUrl(first))).toBe(true);
    expect((await fetch(feedUrl(second))).status).toBe(200);

    // Ninguém lista o bucket nem lê tabelas com o endereço público.
    const { data: listed } = await anon().storage.from('ical').list();
    expect(listed ?? []).toEqual([]);
    const rest = await fetch(`${env().apiUrl}/rest/v1/people?select=*`, { headers: { apikey: env().publishableKey } });
    expect(rest.status === 200 ? await rest.json() : []).toEqual([]);

    expect((await applyOne(as('P1'), op('person.deactivate', { id: person(5) }))).status).toBe('applied');
    await ctx.worker.queue.drain();
    expect(await gone(feedUrl(second))).toBe(true);
    expect(await tokenOf(5)).toBeNull();
  });

  it('IT-081 criar P21 faz o worker enviar o convite com link para #/criar-senha', async () => {
    await clearMail();
    const res = await applyOne(as('P1'), op('person.upsert', {
      name: 'Pessoa Exemplo 21', email: email(21), role_ids: ['b0000000-0000-4000-8000-000000000001'],
    }));
    expect(res.status).toBe('applied');
    await ctx.worker.queue.drain();
    const msgs = await until(async () => { const m = await mailTo(email(21)); return m.length > 0 && m; }, 'e-mail do convite');
    const link = decodeURIComponent(msgs[0]?.html ?? '');
    expect(link).toContain(`${APP_URL}#/criar-senha`);
    expect(await one('select invite_status, auth_user_id is not null as linked from public.people where email = $1', [email(21)]))
      .toEqual({ invite_status: 'sent', linked: true });
  });

  it('IT-082 depois do auth_ban de P5, o login falha e a sessão aberta não se renova', async () => {
    const client = createClient(env().apiUrl, env().publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: login } = await client.auth.signInWithPassword({ email: email(5), password: 'Senha-teste-123' });
    expect(login.session).not.toBeNull();
    expect((await applyOne(as('P1'), op('person.deactivate', { id: person(5) }))).status).toBe('applied');
    await ctx.worker.queue.drain();
    expect(await one("select status from public.jobs where kind = 'auth_ban'")).toEqual({ status: 'done' });

    const again = createClient(env().apiUrl, env().publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await again.auth.signInWithPassword({ email: email(5), password: 'Senha-teste-123' });
    expect(error?.code).toBe('user_banned');
    const refreshed = await client.auth.refreshSession({ refresh_token: login.session?.refresh_token as string });
    expect(refreshed.error).not.toBeNull();

    // Reativada, volta a entrar.
    expect((await applyOne(as('P1'), op('person.reactivate', { id: person(5) }))).status).toBe('applied');
    await ctx.worker.queue.drain();
    const { error: back } = await again.auth.signInWithPassword({ email: email(5), password: 'Senha-teste-123' });
    expect(back).toBeNull();
  });

  it('IT-083 resetPasswordForEmail de P10 entrega e-mail no Inbucket', async () => {
    await clearMail();
    const { error } = await anon().auth.resetPasswordForEmail(email(10), { redirectTo: `${APP_URL}#/criar-senha` });
    expect(error).toBeNull();
    const msgs = await until(async () => { const m = await mailTo(email(10)); return m.length > 0 && m; }, 'e-mail de redefinição');
    expect(decodeURIComponent(msgs[0]?.html ?? '')).toContain('#/criar-senha');
  });

  it('IT-104 request_job invite para P8 com convite expirado cria um job e o worker reenvia o e-mail', async () => {
    await clearMail();
    await sql("update public.people set invite_status = 'sent' where id = $1", [person(8)]);
    await sql("update auth.users set email_confirmed_at = null, last_sign_in_at = null where email = $1", [email(8)]);
    const { job_id } = await rpc<{ job_id: string }>(as('P1'), 'request_job', { kind: 'invite', payload: { person_id: person(8) } });
    await ctx.worker.queue.drain();
    expect(await one('select status, error, payload from public.jobs where id = $1', [job_id]))
      .toEqual({ status: 'done', error: null, payload: { person_id: person(8), resend: true } });
    const msgs = await until(async () => { const m = await mailTo(email(8)); return m.length > 0 && m; }, 'e-mail reenviado');
    expect(decodeURIComponent(msgs[0]?.html ?? '')).toContain(`${APP_URL}#/criar-senha`);
  });

  it('IT-062 a limpeza apaga avisos com mais de 30 dias e mantém os de 29', async () => {
    const day = 86_400_000;
    const now = new Date();
    await sql(
      `insert into public.notifications (person_id, kind, title, dedupe_key, created_at) values
       ($1, 'week_changed', 'velho', 'teste:31d', $2), ($1, 'week_changed', 'recente', 'teste:29d', $3)`,
      [person(10), new Date(now.getTime() - 31 * day), new Date(now.getTime() - 29 * day)],
    );
    const removed = await cleanupNotifications(ctx.store, now);
    expect(removed).toBe(1);
    const left = await sql<{ dedupe_key: string }>("select dedupe_key from public.notifications where dedupe_key like 'teste:%'");
    expect(left).toEqual([{ dedupe_key: 'teste:29d' }]);
  });
});
