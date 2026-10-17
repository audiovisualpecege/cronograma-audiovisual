// calendar_sync contra o Supabase local, com a Google Agenda simulada a partir de fixtures/google.
import { describe, expect, it } from 'vitest';
import { fixture } from '../../../apps/worker/src/test/mocks.ts';
import { EVENT, SLOT, person, type } from '../helpers/ids.ts';
import { as, buildWeekB, one, rpc, sql, useSeed } from '../helpers/supabase.ts';
import { S1, S2, gemini, google, notificationsOf, runJob, setAiKey, useWorker } from './harness.ts';

type GEvent = { id: string; start: { dateTime: string }; end: { dateTime: string }; [k: string]: unknown };
const s1Items = () => fixture<{ items: GEvent[] }>('google/week-b.json').items;
const s1List = (items: GEvent[]) => ({ body: { ...fixture<object>('google/week-b.json'), items } });
const withE1 = (start: string, end: string) =>
  s1Items().map((e) => (e.id === 'g-e1' ? { ...e, start: { dateTime: start }, end: { dateTime: end } } : e));

const eventRow = (id: string) =>
  one<{ status: string; week_start: string; starts_at: Date; change_original: Record<string, unknown> | null; review_pending: boolean;
    restored: boolean; google_event_id: string; source_disconnected: boolean }>('select * from public.events where id = $1', [id]);
const activeSlots = (eventId: string) =>
  sql<{ id: string }>('select id from public.slots where event_id = $1 and archived_at is null', [eventId]);
const byGoogleId = (gid: string) =>
  one<{ id: string; week_start: string; title: string; service_type_id: string | null; type_certainty: string; type_source: string | null;
    review_pending: boolean; status: string }>('select * from public.events where google_event_id = $1', [gid]);
const notificationCount = async () => Number((await one<{ n: string }>('select count(*) n from public.notifications')).n);

describe('calendar_sync contra o Supabase local', () => {
  useSeed();
  const ctx = useWorker();

  it('IT-063 a gravação week-b.json cria os eventos da semana B com tipo e certeza', async () => {
    const res = await runJob(ctx.worker, 'calendar_sync');
    expect(res.status).toBe('done');
    expect(res.result).toMatchObject({ events_new: 2, events_changed: 0, events_cancelled: 0, failed_sources: 0 });
    expect(await byGoogleId('g-b6')).toMatchObject({
      week_start: '2026-10-26', title: 'Gravação aula Geografia', service_type_id: type(1), type_certainty: 'alta', type_source: 'keyword',
      status: 'active', review_pending: false,
    });
    expect(await byGoogleId('g-b7')).toMatchObject({
      week_start: '2026-10-26', service_type_id: null, type_certainty: 'baixa', type_source: null,
    });
    const sources = await sql<{ status: string; last_synced_at: Date; last_error: string | null }>(
      'select status, last_synced_at, last_error from public.calendar_sources order by label',
    );
    // Relógio do worker: quarta 21/10 12:00 em Brasília.
    expect(sources.map((s) => [s.status, s.last_synced_at.toISOString().slice(0, 16), s.last_error])).toEqual([
      ['connected', '2026-10-21T15:00', null],
      ['connected', '2026-10-21T15:00', null],
    ]);
    // Os eventos que já existiam ficam como estavam, agora com a impressão digital.
    expect(await eventRow(EVENT.B1)).toMatchObject({ status: 'active', review_pending: false });
    expect(await notificationCount()).toBe(2);
  });

  it('IT-064 mudança de horário de evento publicado avisa P5 e os administradores; segunda mudança atualiza o mesmo aviso', async () => {
    google.list(S1.cal, s1List(withE1('2026-10-22T15:00:00-03:00', '2026-10-22T18:00:00-03:00')));
    await runJob(ctx.worker, 'calendar_sync');
    const e1 = await eventRow(EVENT.E1);
    expect(e1).toMatchObject({ status: 'changed', review_pending: true });
    expect(new Date(e1.change_original?.startsAt as string).toISOString()).toBe('2026-10-22T17:00:00.000Z');
    const [p5] = await notificationsOf(5, 'event_changed');
    expect(p5).toMatchObject({ title: 'Mudou: Gravação aula Matemática', link: `#/evento/${EVENT.E1}` });
    expect(p5?.body).toBe('Antes: 22/10 14:00 às 17:00, Estúdio 1. Agora: 22/10 15:00 às 18:00, Estúdio 1.');
    expect(await notificationsOf(1, 'event_changed')).toHaveLength(1);
    expect(await notificationsOf(2, 'event_changed')).toHaveLength(1);
    // P6 (Técnico de aula do E1) também está na fotografia; P10, não.
    expect(await notificationsOf(6, 'event_changed')).toHaveLength(1);
    expect(await notificationsOf(10, 'event_changed')).toHaveLength(0);

    google.list(S1.cal, s1List(withE1('2026-10-22T16:00:00-03:00', '2026-10-22T19:00:00-03:00')));
    await runJob(ctx.worker, 'calendar_sync');
    const again = await notificationsOf(5, 'event_changed');
    expect(again).toHaveLength(1);
    expect(again[0]?.id).toBe(p5?.id);
    expect(again[0]?.body).toBe('Antes: 22/10 14:00 às 17:00, Estúdio 1. Agora: 22/10 16:00 às 19:00, Estúdio 1.');
    expect(new Date((await eventRow(EVENT.E1)).change_original?.startsAt as string).toISOString()).toBe('2026-10-22T17:00:00.000Z');
  });

  it('IT-065 evento publicado apagado na agenda fica cancelled, libera as alocações e avisa P5', async () => {
    google.list(S1.cal, s1List(s1Items().filter((e) => e.id !== 'g-e1')));
    const res = await runJob(ctx.worker, 'calendar_sync');
    expect(res.result).toMatchObject({ events_cancelled: 1 });
    expect(google.calls.some((c) => c.url.pathname.endsWith('/events/g-e1'))).toBe(true);
    expect(await eventRow(EVENT.E1)).toMatchObject({ status: 'cancelled', review_pending: true });
    const people = await sql<{ person_id: string | null }>('select person_id from public.assignments where event_id = $1', [EVENT.E1]);
    expect(people.every((a) => a.person_id === null)).toBe(true);
    expect(await notificationsOf(5, 'event_cancelled')).toEqual([
      expect.objectContaining({ title: 'Cancelado: Gravação aula Matemática', body: '22/10 14:00 às 17:00. O evento saiu da Google Agenda.' }),
    ]);
  });

  it('IT-066 evento cancelado que volta entra como novo, com restored=true e sem vagas', async () => {
    google.list(S1.cal, s1List(s1Items().filter((e) => e.id !== 'g-e1')));
    await runJob(ctx.worker, 'calendar_sync');
    expect((await eventRow(EVENT.E1)).status).toBe('cancelled');
    google.list(S1.cal, 'google/week-b.json');
    const res = await runJob(ctx.worker, 'calendar_sync');
    expect(res.result).toMatchObject({ events_new: 1 }); // g-b6 e g-b7 já entraram na primeira leitura
    expect(await eventRow(EVENT.E1)).toMatchObject({ status: 'active', restored: true, review_pending: true });
    expect(await activeSlots(EVENT.E1)).toEqual([]);
  });

  it('IT-067 evento que muda de 21/10 para 28/10 fica cancelado na semana A e novo, sem escala, na semana B', async () => {
    google.list(S1.cal, s1List(withE1('2026-10-28T14:00:00-03:00', '2026-10-28T17:00:00-03:00')));
    await runJob(ctx.worker, 'calendar_sync');
    expect(await eventRow(EVENT.E1)).toMatchObject({ status: 'cancelled', week_start: '2026-10-19', google_event_id: 'g-e1@2026-10-19' });
    const moved = await byGoogleId('g-e1');
    expect(moved).toMatchObject({ week_start: '2026-10-26', status: 'active', service_type_id: type(1) });
    expect(await activeSlots(moved.id)).toEqual([]);
    expect(await notificationsOf(5, 'event_cancelled')).toEqual([
      expect.objectContaining({ body: '22/10 14:00 às 17:00. Mudou para 28/10 14:00 às 17:00.' }),
    ]);
  });

  it('IT-068 evento novo na semana B em montagem entra com review_pending e sem escala', async () => {
    await buildWeekB();
    await runJob(ctx.worker, 'calendar_sync');
    const b6 = await byGoogleId('g-b6');
    expect(b6).toMatchObject({ week_start: '2026-10-26', review_pending: true });
    expect(await activeSlots(b6.id)).toEqual([]);
    expect(await sql('select 1 from public.assignments where event_id = $1 and person_id is not null', [b6.id])).toEqual([]);
    expect(await notificationsOf(1, 'calendar_new')).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Evento novo na agenda: Gravação aula Geografia' })]),
    );
  });

  it('IT-069 origem S2 desativada não é lida e os eventos escalados de S2 ganham a marca', async () => {
    await sql('update public.calendar_sources set enabled = false where id = $1', [S2.id]);
    await runJob(ctx.worker, 'calendar_sync');
    expect(google.calls.filter((c) => c.url.pathname.includes(encodeURIComponent(S2.cal)))).toEqual([]);
    expect((await eventRow(EVENT.E2)).source_disconnected).toBe(true); // P7, P8, P10 e P19 escalados
    expect((await eventRow(EVENT.B3)).source_disconnected).toBe(false); // sem ninguém escalado
    expect((await eventRow(EVENT.E1)).source_disconnected).toBe(false);
    // Religada, a marca sai na leitura seguinte.
    await sql('update public.calendar_sources set enabled = true where id = $1', [S2.id]);
    await runJob(ctx.worker, 'calendar_sync');
    expect((await eventRow(EVENT.E2)).source_disconnected).toBe(false);
  });

  it('IT-070 origem sem eventos fica connected com 0 eventos', async () => {
    const { id } = await one<{ id: string }>(
      "insert into public.calendar_sources (google_calendar_id, label) values ('agenda-vazia@gmail.com', 'agenda vazia') returning id",
    );
    google.list('agenda-vazia@gmail.com', 'google/empty.json');
    const res = await runJob(ctx.worker, 'calendar_sync');
    expect(google.calls.some((c) => c.url.pathname.endsWith(`/calendars/${encodeURIComponent('agenda-vazia@gmail.com')}`))).toBe(true);
    expect(await one('select status, last_error from public.calendar_sources where id = $1', [id])).toEqual({ status: 'connected', last_error: null });
    expect((res.result?.sources as { source_id: string; events: number }[]).find((s) => s.source_id === id)).toMatchObject({ events: 0, status: 'connected' });
  });

  it('IT-071 mudança em evento da semana 12/10 é gravada sem nenhum aviso', async () => {
    const before = await notificationCount();
    const items = s1Items().map((e) =>
      e.id === 'g-e0' ? { ...e, start: { dateTime: '2026-10-14T10:00:00-03:00' }, end: { dateTime: '2026-10-14T13:00:00-03:00' } } : e,
    );
    google.list(S1.cal, s1List(items));
    await runJob(ctx.worker, 'calendar_sync');
    const e0 = await eventRow(EVENT.E0);
    expect(e0.starts_at.toISOString()).toBe('2026-10-14T13:00:00.000Z');
    expect(e0).toMatchObject({ status: 'active', review_pending: false, change_original: null });
    // Os eventos novos da semana B também não avisam: a semana B não está montada.
    expect(await notificationCount()).toBe(before);
  });

  it('IT-072 uma rodada completa só faz requisições GET à Calendar API', async () => {
    google.list(S1.cal, s1List(withE1('2026-10-28T14:00:00-03:00', '2026-10-28T17:00:00-03:00').filter((e) => e.id !== 'g-b2')));
    await sql("update public.calendar_sources set status = 'pending' where id = $1", [S2.id]);
    await runJob(ctx.worker, 'calendar_sync');
    const paths = google.calls.map((c) => c.url.pathname);
    expect(paths.some((p) => p.endsWith('/events'))).toBe(true); // events.list
    expect(paths.some((p) => p.endsWith('/events/g-b2'))).toBe(true); // events.get
    expect(paths.some((p) => p.endsWith(`/calendars/${encodeURIComponent(S2.cal)}`))).toBe(true); // calendars.get
    expect(google.calls.length).toBeGreaterThan(3);
    expect(google.nonGet).toEqual([]);
    expect(google.calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('IT-087 com a classificação pela IA desligada, a releitura não chama o Gemini', async () => {
    await setAiKey();
    await sql('update public.settings set ai_classification_enabled = false');
    await runJob(ctx.worker, 'calendar_sync');
    expect(gemini.requests).toEqual([]);
    expect((await byGoogleId('g-b7')).type_certainty).toBe('baixa');

    // Ligada, o título sem palavra-chave vai para a IA, e só ele.
    await sql("delete from public.events where google_event_id = 'g-b7'");
    await sql('update public.settings set ai_classification_enabled = true');
    gemini.queue.push({ body: fixture('gemini/classify.json') });
    await runJob(ctx.worker, 'calendar_sync');
    expect(gemini.requests).toHaveLength(1);
    expect(JSON.parse(gemini.requests[0]?.body.contents[0]?.parts[0]?.text ?? '{}').items).toEqual([
      { id: 'E1', title: 'Live de lançamento do curso' },
    ]);
    expect(await byGoogleId('g-b7')).toMatchObject({ service_type_id: type(3), type_certainty: 'media', type_source: 'ai' });
  });

  it('nenhuma escrita na agenda e o admin pode pedir a releitura pelo request_job', async () => {
    const { job_id } = await rpc<{ job_id: string }>(as('P1'), 'request_job', { kind: 'calendar_sync', payload: {} });
    await ctx.worker.queue.drain();
    expect(await one('select status, requested_by from public.jobs where id = $1', [job_id])).toEqual({ status: 'done', requested_by: person(1) });
    expect(SLOT.E1_R1).toBeTruthy();
  });
});
