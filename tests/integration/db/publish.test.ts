// publish_week e discard_week_changes: fotografia por revisão, avisos, repetição, concorrência e descarte.
import { describe, expect, it } from 'vitest';
import { EVENT, person, role, WEEK_PAST } from '../helpers/ids.ts';
import {
  applyOne, as, assignmentOf, buildWeekB, one, op, rpc, rpcError, service, slotOf, sql, useSeed,
} from '../helpers/supabase.ts';

const set = async (slot: string, n: number) => {
  const res = await applyOne(as('P1'), op('assignment.set', { slot_id: slot, person_id: person(n) }));
  expect(res.status).toBe('applied');
};
const clear = (slot: string) => applyOne(as('P1'), op('assignment.clear', { slot_id: slot }));
const publish = (weekId: string, expected: number, who: 'P1' | 'P2' = 'P1') =>
  rpc<{ revision: number; notified: number }>(as(who), 'publish_week', { week_id: weekId, expected_revision: expected });

const notificationsOf = (n: number) =>
  sql<{ title: string; body: string; kind: string; link: string }>(
    "select title, body, kind, link from public.notifications where person_id = $1 and dedupe_key like 'publish:%' order by created_at",
    [person(n)],
  );

describe('publish_week', () => {
  useSeed();

  it('IT-042 publicar a semana B grava a revisão 1, quem publicou e um aviso para cada escalado', async () => {
    const { weekId } = await buildWeekB();
    await set(await slotOf(EVENT.B1, 'R1'), 5);
    await set(await slotOf(EVENT.B1, 'R5'), 6);
    expect(await publish(weekId, 0)).toEqual({ revision: 1, notified: 2 });

    const snap = await sql<{ person_id: string | null }>(
      'select person_id from public.published_assignments where week_id = $1 and revision = 1', [weekId],
    );
    expect(snap).toHaveLength(6);
    expect(snap.map((r) => r.person_id).filter(Boolean).sort()).toEqual([person(5), person(6)]);
    const pub = await one<{ published_by: string; published_at: Date; kind: string }>(
      'select published_by, published_at, kind from public.publications where week_id = $1', [weekId],
    );
    expect(pub).toMatchObject({ published_by: person(1), kind: 'week' });
    expect(pub.published_at).toBeInstanceOf(Date);
    expect(await one('select state, revision, published_by from public.weeks where id = $1', [weekId]))
      .toEqual({ state: 'published', revision: 1, published_by: person(1) });
    for (const n of [5, 6]) {
      expect(await notificationsOf(n)).toEqual([{
        title: 'Sua semana de 26/10 foi publicada', body: 'Você tem 1 atividade nesta semana.',
        kind: 'week_published', link: '#/minha-semana/2026-10-26',
      }]);
    }
    const { data } = await as('P10').from('events').select('id').eq('week_start', '2026-10-26');
    expect(data?.map((e) => e.id).sort()).toEqual([EVENT.B1, EVENT.B2, EVENT.B3, EVENT.B5].sort());
  });

  it('IT-043 duas chamadas com expected_revision=0 produzem uma publicação e um aviso por pessoa', async () => {
    const { weekId } = await buildWeekB();
    await set(await slotOf(EVENT.B1, 'R1'), 5);
    const [a, b] = await Promise.all([publish(weekId, 0), publish(weekId, 0)]);
    expect(a.revision).toBe(1);
    expect(b.revision).toBe(1);
    expect(await sql('select * from public.publications where week_id = $1', [weekId])).toHaveLength(1);
    expect(await notificationsOf(5)).toHaveLength(1);
    expect(await sql('select * from public.published_assignments where week_id = $1', [weekId])).toHaveLength(6);
  });

  it('IT-044 P2 publica com a mesma revisão que P1 acabou de publicar e recebe stale_revision', async () => {
    const { weekId } = await buildWeekB();
    await publish(weekId, 0);
    await set(await slotOf(EVENT.B1, 'R1'), 5);
    expect((await publish(weekId, 1)).revision).toBe(2);
    const err = await rpcError(as('P2'), 'publish_week', { week_id: weekId, expected_revision: 1 });
    expect(err.code).toBe('stale_revision');
    expect(err.detail).toContain('já foi publicada por Pessoa Exemplo 01');
    expect(await sql('select * from public.publications where week_id = $1', [weekId])).toHaveLength(2);
  });

  it('IT-045 vaga aberta publicada vira linha com person_id nulo', async () => {
    const { weekId } = await buildWeekB();
    await set(await slotOf(EVENT.B1, 'R1'), 5);
    await publish(weekId, 0);
    const open = await sql('select * from public.published_assignments where week_id = $1 and person_id is null', [weekId]);
    expect(open).toHaveLength(5);
    const { data } = await as('P10').from('published_assignments').select('person_id').eq('week_id', weekId).is('person_id', null);
    expect(data).toHaveLength(5);
  });

  it('IT-046 propostas pendentes não entram na fotografia', async () => {
    const { weekId } = await buildWeekB();
    await service().from('assignments').update({ person_id: person(4), status: 'proposed' })
      .eq('slot_id', await slotOf(EVENT.B2, 'R1')).throwOnError();
    await publish(weekId, 0);
    expect(await sql('select * from public.published_assignments where person_id = $1', [person(4)])).toHaveLength(0);
    expect(await notificationsOf(4)).toHaveLength(0);
  });

  it('IT-047 publicar alterações avisa quem saiu e quem entrou, e ninguém para quem saiu e voltou', async () => {
    const { weekId } = await buildWeekB();
    const b1 = await slotOf(EVENT.B1, 'R1');
    const b2 = await slotOf(EVENT.B2, 'R1');
    await set(b1, 5);
    await set(b2, 7);
    await publish(weekId, 0);

    await clear(b1);
    await set(b1, 6);
    await clear(b2);
    await set(b2, 7);
    expect(await publish(weekId, 1)).toEqual({ revision: 2, notified: 2 });

    const changes = await sql<{ person_id: string; title: string; body: string }>(
      "select person_id, title, body from public.notifications where kind = 'week_changed' and dedupe_key like 'publish:%' order by person_id",
    );
    expect(changes).toEqual([
      { person_id: person(5), title: 'Sua semana de 26/10 mudou', body: 'Saiu: Gravação aula Biologia (Câmera), 26/10 09:00' },
      { person_id: person(6), title: 'Sua semana de 26/10 mudou', body: 'Entrou: Gravação aula Biologia (Câmera), 26/10 09:00' },
    ]);
    expect(await one('select kind from public.publications where week_id = $1 and revision = 2', [weekId])).toEqual({ kind: 'changes' });
  });

  it('IT-048 discard_week_changes devolve a escala à fotografia e zera dirty_since', async () => {
    const { weekId } = await buildWeekB();
    const b1 = await slotOf(EVENT.B1, 'R1');
    await set(b1, 5);
    await publish(weekId, 0);

    await clear(b1);
    const extra = await applyOne(as('P1'), op('slot.add', { event_id: EVENT.B2, job_role_id: role(2) }));
    await set(extra.id as string, 9);
    expect((await one<{ dirty_since: Date | null }>('select dirty_since from public.weeks where id = $1', [weekId])).dirty_since).not.toBeNull();

    const res = await rpc<{ restored_slots: number }>(as('P1'), 'discard_week_changes', { week_id: weekId });
    expect(res.restored_slots).toBe(2);
    expect(await assignmentOf(b1)).toMatchObject({ person_id: person(5), status: 'confirmed' });
    expect(await assignmentOf(extra.id as string)).toMatchObject({ person_id: null });
    expect((await one<{ archived_at: Date | null }>('select archived_at from public.slots where id = $1', [extra.id])).archived_at).not.toBeNull();
    expect(await one('select dirty_since, revision from public.weeks where id = $1', [weekId])).toEqual({ dirty_since: null, revision: 1 });
  });

  it('IT-049 primeira publicação da semana 2026-10-12 devolve week_past', async () => {
    const err = await rpcError(as('P1'), 'publish_week', { week_id: WEEK_PAST.id, expected_revision: 0 });
    expect(err.code).toBe('week_past');
    expect(await one('select state, revision from public.weeks where id = $1', [WEEK_PAST.id])).toEqual({ state: 'building', revision: 0 });
  });

  it('Equipe não publica nem descarta', async () => {
    const { weekId } = await buildWeekB();
    expect((await rpcError(as('P10'), 'publish_week', { week_id: weekId, expected_revision: 0 })).code).toBe('forbidden');
    expect((await rpcError(as('P10'), 'discard_week_changes', { week_id: weekId })).code).toBe('forbidden');
  });
});
