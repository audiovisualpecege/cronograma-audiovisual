// apply_ops em eventos: dados extras, atividades internas, pendências, duplicados e mudança vinda da agenda.
import { describe, expect, it } from 'vitest';
import { EVENT, person, SLOT, type, WEEK_A } from '../helpers/ids.ts';
import {
  applyOne, as, assignmentOf, buildWeekB, one, op, rpc, service, slotOf, sql, useSeed,
} from '../helpers/supabase.ts';

const activeSlots = async (eventId: string) =>
  sql<{ id: string; code: string }>(
    `select s.id, r.code from public.slots s join public.job_roles r on r.id = s.job_role_id
     where s.event_id = $1 and s.archived_at is null order by r.code, s.id`,
    [eventId],
  );
const eventVersion = async (id: string) => (await one<{ version: number }>('select version from public.events where id = $1', [id])).version;
const dirtySince = async () =>
  (await one<{ dirty_since: Date | null }>('select dirty_since from public.weeks where id = $1', [WEEK_A.id])).dirty_since;

describe('apply_ops: eventos', () => {
  useSeed();

  it('IT-023 trocar o tipo refaz as vagas sem alocação; com alocação pede mode, e keep mantém as vagas', async () => {
    await buildWeekB();
    const before = await activeSlots(EVENT.B2);
    const res = await applyOne(as('P1'), op('event.update_extras', { id: EVENT.B2, service_type_id: type(2) }, await eventVersion(EVENT.B2)));
    expect(res.status).toBe('applied');
    const after = await activeSlots(EVENT.B2);
    expect(after.map((s) => s.code)).toEqual(['R1', 'R1', 'R2', 'R6']);
    expect(after.some((s) => before.some((b) => b.id === s.id))).toBe(false);
    expect(await one('select type_source, type_certainty from public.events where id = $1', [EVENT.B2]))
      .toEqual({ type_source: 'admin', type_certainty: 'alta' });

    await applyOne(as('P1'), op('assignment.set', { slot_id: await slotOf(EVENT.B1, 'R1'), person_id: person(5) }));
    const b1 = await activeSlots(EVENT.B1);
    const noMode = await applyOne(as('P1'), op('event.update_extras', { id: EVENT.B1, service_type_id: type(2) }));
    expect(noMode).toMatchObject({ status: 'rejected', code: 'mode_required' });
    const keep = await applyOne(as('P1'), op('event.update_extras', { id: EVENT.B1, service_type_id: type(2), mode: 'keep' }));
    expect(keep.status).toBe('applied');
    expect(await activeSlots(EVENT.B1)).toEqual(b1);
    expect((await one<{ service_type_id: string }>('select service_type_id from public.events where id = $1', [EVENT.B1])).service_type_id).toBe(type(2));
  });

  it('IT-024 observação com 2.001 caracteres devolve notes_too_long', async () => {
    const res = await applyOne(as('P1'), op('event.update_extras', { id: EVENT.B1, notes: 'x'.repeat(2001) }));
    expect(res).toMatchObject({ status: 'rejected', code: 'notes_too_long' });
    const ok = await applyOne(as('P1'), op('event.update_extras', { id: EVENT.B1, notes: 'x'.repeat(2000) }));
    expect(ok.status).toBe('applied');
  });

  it('IT-025 dados extras em evento cancelado devolve event_cancelled', async () => {
    await service().from('events').update({ status: 'cancelled' }).eq('id', EVENT.B3).throwOnError();
    const res = await applyOne(as('P1'), op('event.update_extras', { id: EVENT.B3, notes: 'Trazer tripé' }));
    expect(res).toMatchObject({ status: 'rejected', code: 'event_cancelled' });
  });

  it('IT-026 editar alocação da semana A publicada grava dirty_since e a equipe vê a fotografia antiga', async () => {
    expect(await dirtySince()).toBeNull();
    const res = await applyOne(as('P1'), op('assignment.set', { slot_id: SLOT.E1_R5, person_id: person(17) }, (await assignmentOf(SLOT.E1_R5)).version));
    expect(res.status).toBe('applied');
    expect(await dirtySince()).not.toBeNull();
    const { data } = await as('P10').from('published_assignments').select('person_id, revision').eq('slot_id', SLOT.E1_R5);
    expect(data).toEqual([{ person_id: person(6), revision: 2 }]);
  });

  it('IT-034 atividade interna nasce com as vagas do tipo e, na semana publicada, marca dirty_since', async () => {
    await buildWeekB();
    const b = await applyOne(as('P1'), op('event.internal_upsert', {
      title: 'Plantão de edição', starts_at: '2026-10-29T08:00:00-03:00', ends_at: '2026-10-29T12:00:00-03:00', service_type_id: type(1),
    }));
    expect(b.status).toBe('applied');
    expect(await one('select origin, week_start, calendar_source_id from public.events where id = $1', [b.id]))
      .toEqual({ origin: 'internal', week_start: '2026-10-26', calendar_source_id: null });
    expect((await activeSlots(b.id as string)).map((s) => s.code)).toEqual(['R1', 'R5']);

    expect(await dirtySince()).toBeNull();
    const a = await applyOne(as('P1'), op('event.internal_upsert', {
      title: 'Plantão de sábado', starts_at: '2026-10-24T09:00:00-03:00', ends_at: '2026-10-24T13:00:00-03:00', service_type_id: type(1),
    }));
    expect(a.status).toBe('applied');
    expect(await dirtySince()).not.toBeNull();
  });

  it('IT-035 cancelar atividade interna na semana publicada vira alteração não publicada', async () => {
    const a = await applyOne(as('P1'), op('event.internal_upsert', {
      title: 'Plantão de sábado', starts_at: '2026-10-24T09:00:00-03:00', ends_at: '2026-10-24T13:00:00-03:00', service_type_id: type(1),
    }));
    await applyOne(as('P1'), op('assignment.set', { slot_id: await slotOf(a.id as string, 'R1'), person_id: person(3) }));
    await rpc(as('P1'), 'publish_week', { week_id: WEEK_A.id, expected_revision: 2 });
    expect(await dirtySince()).toBeNull();

    const res = await applyOne(as('P1'), op('event.internal_cancel', { id: a.id }, await eventVersion(a.id as string)));
    expect(res.status).toBe('applied');
    expect(await one('select status from public.events where id = $1', [a.id])).toEqual({ status: 'cancelled' });
    expect(await dirtySince()).not.toBeNull();
    expect(await sql('select * from public.assignments where event_id = $1 and person_id is not null', [a.id])).toHaveLength(0);
    const calendar = await applyOne(as('P1'), op('event.internal_cancel', { id: EVENT.E1 }));
    expect(calendar).toMatchObject({ status: 'rejected', code: 'forbidden' });
  });

  it('IT-036 marcar revisado grava review_pending=false', async () => {
    await sql('update public.events set review_pending = true where id = $1', [EVENT.B1]);
    const res = await applyOne(as('P1'), op('event.mark_reviewed', { id: EVENT.B1 }, await eventVersion(EVENT.B1)));
    expect(res.status).toBe('applied');
    expect(await one('select review_pending from public.events where id = $1', [EVENT.B1])).toEqual({ review_pending: false });
  });

  it('IT-037 resolver duplicado com keep=one ignora o outro evento do grupo, sem vagas', async () => {
    await buildWeekB();
    await sql("update public.events set duplicate_group = 'dup-1' where id = any($1)", [[EVENT.B1, EVENT.B2]]);
    const res = await applyOne(as('P1'), op('event.resolve_duplicate', { id: EVENT.B1, keep: 'one' }));
    expect(res.status).toBe('applied');
    const rows = await sql<{ id: string; ignored: boolean; duplicate_group: string | null }>(
      'select id, ignored, duplicate_group from public.events where id = any($1) order by id', [[EVENT.B1, EVENT.B2]],
    );
    expect(rows).toEqual([
      { id: EVENT.B1, ignored: false, duplicate_group: null },
      { id: EVENT.B2, ignored: true, duplicate_group: null },
    ]);
    expect(await activeSlots(EVENT.B2)).toHaveLength(0);
    expect(await activeSlots(EVENT.B1)).toHaveLength(2);
  });

  it('IT-099 mudança de horário vinda da agenda que cria sobreposição grava overlap e review_pending', async () => {
    const plantao = await applyOne(as('P1'), op('event.internal_upsert', {
      title: 'Plantão de sábado', starts_at: '2026-10-24T10:00:00-03:00', ends_at: '2026-10-24T12:00:00-03:00', service_type_id: type(1),
    }));
    const slot = await slotOf(plantao.id as string, 'R1');
    expect((await applyOne(as('P1'), op('assignment.set', { slot_id: slot, person_id: person(5) }))).status).toBe('applied');
    expect((await assignmentOf(SLOT.E1_R1)).warnings).toEqual([]);

    // O serviço de fundo grava a mudança da agenda com a service_role.
    await service().from('events').update({
      starts_at: '2026-10-24T11:00:00-03:00', ends_at: '2026-10-24T14:00:00-03:00', status: 'changed',
    }).eq('id', EVENT.E1).throwOnError();
    expect((await assignmentOf(SLOT.E1_R1)).warnings).toEqual(['overlap']);
    expect((await assignmentOf(slot)).warnings).toEqual(['overlap']);
    expect(await one('select review_pending, week_start from public.events where id = $1', [EVENT.E1]))
      .toEqual({ review_pending: true, week_start: '2026-10-19' });
  });
});
