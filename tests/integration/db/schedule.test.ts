// apply_ops na escala: conflito por versão, alertas e bloqueios, propostas, vagas extras e trava.
import { describe, expect, it } from 'vitest';
import { EVENT, person, role, SLOT, type } from '../helpers/ids.ts';
import {
  applyOne, as, assignmentOf, buildWeekB, op, service, slotOf, sql, useSeed,
} from '../helpers/supabase.ts';

/** Proposta gravada como o serviço de fundo grava (service_role). */
async function propose(slotId: string, personId: string) {
  await service().from('assignments')
    .update({ person_id: personId, status: 'proposed', reason: 'costuma fazer gravação de aula' })
    .eq('slot_id', slotId).throwOnError();
  return assignmentOf(slotId);
}

describe('apply_ops: escala', () => {
  useSeed();

  it('IT-013 assignment.set com baseVersion 3 e linha na versão 4 devolve conflict com as duas versões', async () => {
    for (let i = 0; i < 3; i++) await sql('update public.assignments set locked = locked where slot_id = $1', [SLOT.E1_R1]);
    expect((await assignmentOf(SLOT.E1_R1)).version).toBe(4);
    const res = await applyOne(as('P1'), op('assignment.set', { slot_id: SLOT.E1_R1, person_id: person(3) }, 3));
    expect(res.status).toBe('conflict');
    expect(res.server).toMatchObject({ version: 4, person_id: person(5) });
    expect(res.local).toMatchObject({ slot_id: SLOT.E1_R1, person_id: person(3) });
    expect((await assignmentOf(SLOT.E1_R1)).person_id).toBe(person(5));
    // "Minha versão": o mesmo opId reenviado com a versão do servidor vale.
    const again = await applyOne(as('P1'), { ...op('assignment.set', { slot_id: SLOT.E1_R1, person_id: person(3) }, 4), opId: res.opId });
    expect(again).toMatchObject({ status: 'applied', version: 5 });
  });

  it('IT-027 alerta overlap sem override devolve needs_override; com override grava e guarda o alerta', async () => {
    await buildWeekB();
    await applyOne(as('P1'), op('assignment.set', { slot_id: await slotOf(EVENT.B1, 'R1'), person_id: person(5) }));
    const extra = await applyOne(as('P1'), op('event.internal_upsert', {
      title: 'Gravação extra', starts_at: '2026-10-26T10:00:00-03:00', ends_at: '2026-10-26T11:00:00-03:00', service_type_id: type(1),
    }));
    const slot = await slotOf(extra.id as string, 'R1');
    const denied = await applyOne(as('P1'), op('assignment.set', { slot_id: slot, person_id: person(5) }));
    expect(denied).toMatchObject({ status: 'rejected', code: 'needs_override' });
    expect(denied.message).toContain('horário sobreposto');
    const forced = await applyOne(as('P1'), op('assignment.set', { slot_id: slot, person_id: person(5), override: true }));
    expect(forced.status).toBe('applied');
    expect(await assignmentOf(slot)).toMatchObject({ person_id: person(5), status: 'confirmed', warnings: ['overlap'], override: true });
  });

  it('IT-028 bloqueios: pessoa inativa, evento cancelado, mesma pessoa no evento e semana passada', async () => {
    await buildWeekB();
    await service().from('people').update({ active: false }).eq('id', person(3)).throwOnError();
    await service().from('events').update({ status: 'cancelled' }).eq('id', EVENT.B2).throwOnError();
    await applyOne(as('P1'), op('assignment.set', { slot_id: await slotOf(EVENT.B1, 'R1'), person_id: person(6) }));

    const cases: [string, string, string][] = [
      [await slotOf(EVENT.B3, 'R1'), person(3), 'person_inactive'],
      [await slotOf(EVENT.B2, 'R1'), person(4), 'event_cancelled'],
      [await slotOf(EVENT.B1, 'R5'), person(6), 'same_event_twice'],
      [SLOT.E0_R1, person(5), 'week_past'],
    ];
    for (const [slot, who, code] of cases) {
      const res = await applyOne(as('P1'), op('assignment.set', { slot_id: slot, person_id: who, override: true }));
      expect({ code, res: [res.status, res.code] }).toEqual({ code, res: ['rejected', code] });
      expect(res.message).toBeTruthy();
    }
  });

  it('IT-029 aceitar proposta de P5 depois de ausência no horário devolve absent e a vaga fica aberta', async () => {
    await buildWeekB();
    const slot = await slotOf(EVENT.B1, 'R1');
    await propose(slot, person(5));
    await applyOne(as('P1'), op('absence.upsert', {
      person_id: person(5), kind: 'folga', starts_at: '2026-10-26T08:00:00-03:00', ends_at: '2026-10-26T13:00:00-03:00',
    }));
    const res = await applyOne(as('P1'), op('assignment.accept', { slot_id: slot }));
    expect(res).toMatchObject({ status: 'rejected', code: 'absent' });
    expect(await assignmentOf(slot)).toMatchObject({ person_id: null, status: null });
  });

  it('IT-030 P1 aceita a proposta e P2 descarta com a versão antiga: conflict com decided_by=P1', async () => {
    await buildWeekB();
    const slot = await slotOf(EVENT.B1, 'R1');
    const proposed = await propose(slot, person(5));
    const accepted = await applyOne(as('P1'), op('assignment.accept', { slot_id: slot }, proposed.version));
    expect(accepted.status).toBe('applied');
    const discarded = await applyOne(as('P2'), op('assignment.discard', { slot_id: slot }, proposed.version));
    expect(discarded.status).toBe('conflict');
    expect(discarded.server).toMatchObject({ decided_by: person(1), status: 'confirmed', person_id: person(5) });
    const late = await applyOne(as('P2'), op('assignment.discard', { slot_id: slot }));
    expect(late).toMatchObject({ status: 'rejected', code: 'already_decided', message: 'Esta vaga já foi decidida por Pessoa Exemplo 01.' });
  });

  it('IT-031 assignment.clear em semana em montagem deixa a vaga aberta', async () => {
    await buildWeekB();
    const slot = await slotOf(EVENT.B1, 'R1');
    await applyOne(as('P1'), op('assignment.set', { slot_id: slot, person_id: person(5) }));
    const res = await applyOne(as('P1'), op('assignment.clear', { slot_id: slot }, (await assignmentOf(slot)).version));
    expect(res.status).toBe('applied');
    expect(await assignmentOf(slot)).toMatchObject({ person_id: null, status: null, warnings: [] });
    expect(await sql("select state, dirty_since from public.weeks where week_start = '2026-10-26'"))
      .toEqual([{ state: 'building', dirty_since: null }]);
  });

  it('IT-032 slot.add cria vaga extra e slot.remove numa vaga vazia a arquiva', async () => {
    await buildWeekB();
    const added = await applyOne(as('P1'), op('slot.add', { event_id: EVENT.B1, job_role_id: role(2) }));
    expect(added.status).toBe('applied');
    const [slot] = await sql<{ extra: boolean; job_role_id: string }>('select extra, job_role_id from public.slots where id = $1', [added.id]);
    expect(slot).toEqual({ extra: true, job_role_id: role(2) });
    expect((await assignmentOf(added.id as string)).person_id).toBeNull();
    const removed = await applyOne(as('P1'), op('slot.remove', { id: added.id }, 1));
    expect(removed.status).toBe('applied');
    expect((await sql<{ archived_at: Date | null }>('select archived_at from public.slots where id = $1', [added.id]))[0]?.archived_at).not.toBeNull();
  });

  it('IT-033 assignment.lock grava locked=true', async () => {
    await buildWeekB();
    const slot = await slotOf(EVENT.B1, 'R1');
    await applyOne(as('P1'), op('assignment.set', { slot_id: slot, person_id: person(5) }));
    const res = await applyOne(as('P1'), op('assignment.lock', { slot_id: slot, locked: true }, (await assignmentOf(slot)).version));
    expect(res.status).toBe('applied');
    expect(await assignmentOf(slot)).toMatchObject({ locked: true, person_id: person(5) });
  });

  it('IT-101 aceitar uma vaga, todas de um evento e todas da semana confirma as propostas', async () => {
    await buildWeekB();
    const plan: [string, string, number][] = [
      [EVENT.B1, 'R1', 5], [EVENT.B1, 'R5', 6], [EVENT.B2, 'R1', 4], [EVENT.B2, 'R5', 17], [EVENT.B3, 'R1', 3], [EVENT.B3, 'R5', 18],
    ];
    for (const [ev, code, n] of plan) await propose(await slotOf(ev, code), person(n));

    expect((await applyOne(as('P1'), op('assignment.accept', { slot_id: await slotOf(EVENT.B1, 'R1') }))).status).toBe('applied');
    const byEvent = await applyOne(as('P1'), op('assignment.accept', { event_id: EVENT.B2 }));
    expect(byEvent).toMatchObject({ status: 'applied', accepted: 2, rejected: [] });
    const byWeek = await applyOne(as('P1'), op('assignment.accept', { week_start: '2026-10-26' }));
    expect(byWeek).toMatchObject({ status: 'applied', accepted: 3, rejected: [] });
    const rows = await sql<{ status: string; decided_by: string }>(
      "select a.status, a.decided_by from public.assignments a join public.events e on e.id = a.event_id where e.week_start = '2026-10-26'",
    );
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.status === 'confirmed' && r.decided_by === person(1))).toBe(true);
  });

  it('IT-102 descartar uma proposta deixa a vaga aberta', async () => {
    await buildWeekB();
    const slot = await slotOf(EVENT.B1, 'R1');
    await propose(slot, person(5));
    expect((await applyOne(as('P1'), op('assignment.discard', { slot_id: slot }))).status).toBe('applied');
    expect(await assignmentOf(slot)).toMatchObject({ person_id: null, status: null, reason: null });
  });

  it('IT-103 assignment.set enfileirado sem rede para evento cancelado no meio tempo devolve event_cancelled', async () => {
    await buildWeekB();
    const slot = await slotOf(EVENT.B2, 'R1');
    const queued = op('assignment.set', { slot_id: slot, person_id: person(4) }, (await assignmentOf(slot)).version);
    await service().from('events').update({ status: 'cancelled' }).eq('id', EVENT.B2).throwOnError();
    const res = await applyOne(as('P1'), queued);
    expect(res).toMatchObject({ status: 'rejected', code: 'event_cancelled', message: 'Evento cancelado não aceita alocações.' });
    expect((await assignmentOf(slot)).person_id).toBeNull();
  });
});
