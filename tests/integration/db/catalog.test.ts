// apply_ops em cadastros: funções, tipos de serviço e ausências, com os alertas que eles disparam.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EVENT, person, role, SLOT, type } from '../helpers/ids.ts';
import {
  applyOne, as, assignmentOf, buildWeekB, one, op, slotOf, sql, useSeed,
} from '../helpers/supabase.ts';

const activeSlots = async (eventId: string) =>
  sql<{ code: string }>(
    `select r.code from public.slots s join public.job_roles r on r.id = s.job_role_id
     where s.event_id = $1 and s.archived_at is null order by r.code`,
    [eventId],
  ).then((rows) => rows.map((r) => r.code));

describe('apply_ops: funções e tipos', () => {
  useSeed();

  it('IT-016 nome repetido sem acento devolve name_taken; renomear R1 muda o histórico de semanas passadas', async () => {
    const dup = await applyOne(as('P1'), op('job_role.upsert', { name: ' camera ' }));
    expect(dup).toMatchObject({ status: 'rejected', code: 'name_taken' });

    const [imp] = await sql<{ id: string }>("insert into public.history_imports (file_name) values ('2025.xlsx') returning id");
    await sql(
      `insert into public.history_entries (import_id, week_start, event_date, event_key, title, job_role_id, person_id, raw_name)
       values ($1, '2026-09-28', '2026-09-30', 'k1', 'Gravação aula', $2, $3, 'Pessoa Exemplo 05')`,
      [imp?.id, role(1), person(5)],
    );
    const res = await applyOne(as('P1'), op('job_role.upsert', { id: role(1), name: 'Câmera principal' }));
    expect(res.status).toBe('applied');
    const { data } = await as('P1').from('history_facts').select('job_role_name, week_start');
    expect(data).toEqual([{ job_role_name: 'Câmera principal', week_start: '2026-09-28' }]);
  });

  it('IT-017 arquivar R6 mantém as vagas da semana B com role_archived e R6 sai das vagas novas', async () => {
    await buildWeekB();
    const added = await applyOne(as('P1'), op('slot.add', { event_id: EVENT.B1, job_role_id: role(6) }));
    const filled = await applyOne(as('P1'), op('slot.add', { event_id: EVENT.B2, job_role_id: role(6) }));
    await applyOne(as('P1'), op('assignment.set', { slot_id: filled.id, person_id: person(19) }));

    expect((await applyOne(as('P1'), op('job_role.archive', { id: role(6) }))).status).toBe('applied');
    expect((await assignmentOf(added.id as string)).warnings).toEqual(['role_archived']);
    expect(await assignmentOf(filled.id as string)).toMatchObject({ person_id: person(19), warnings: ['role_archived'] });
    expect(await activeSlots(EVENT.B1)).toEqual(['R1', 'R5', 'R6']);

    const again = await applyOne(as('P1'), op('slot.add', { event_id: EVENT.B3, job_role_id: role(6) }));
    expect(again).toMatchObject({ status: 'rejected', code: 'role_archived' });
    const internal = await applyOne(as('P1'), op('event.internal_upsert', {
      title: 'Feira de tecnologia', starts_at: '2026-10-29T13:00:00-03:00', ends_at: '2026-10-29T18:00:00-03:00', service_type_id: type(2),
    }));
    expect(await activeSlots(internal.id as string)).toEqual(['R1', 'R1', 'R2']);
  });

  it('IT-018 tipo com quantidade 31 ou sem equipe é recusado; válido é aplicado', async () => {
    const tooMany = await applyOne(as('P1'), op('service_type.upsert', { name: 'Drone', crew: [{ job_role_id: role(1), quantity: 31 }] }));
    expect(tooMany).toMatchObject({ status: 'rejected', code: 'invalid_quantity' });
    const empty = await applyOne(as('P1'), op('service_type.upsert', { name: 'Drone', crew: [], no_team: false }));
    expect(empty).toMatchObject({ status: 'rejected', code: 'type_without_crew' });
    const ok = await applyOne(as('P1'), op('service_type.upsert', { name: 'Drone', keywords: ['drone'], crew: [{ job_role_id: role(1), quantity: 30 }] }));
    expect(ok.status).toBe('applied');
    expect(await one('select code, keywords from public.service_types where id = $1', [ok.id])).toEqual({ code: 'T5', keywords: ['drone'] });
  });

  it('IT-019 mudar a equipe de T1 refaz as vagas dos eventos sem alocação e marca crew_outdated nos que têm', async () => {
    await buildWeekB();
    await applyOne(as('P1'), op('assignment.set', { slot_id: await slotOf(EVENT.B1, 'R1'), person_id: person(5) }));
    const res = await applyOne(as('P1'), op('service_type.upsert', {
      id: type(1), name: 'Gravação de aula', keywords: ['aula'],
      crew: [{ job_role_id: role(1), quantity: 2 }, { job_role_id: role(5), quantity: 1 }],
    }));
    expect(res.status).toBe('applied');
    expect(await activeSlots(EVENT.B1)).toEqual(['R1', 'R5']);
    expect(await activeSlots(EVENT.B2)).toEqual(['R1', 'R1', 'R5']);
    expect(await activeSlots(EVENT.B3)).toEqual(['R1', 'R1', 'R5']);
    const flags = await sql<{ id: string; crew_outdated: boolean }>(
      'select id, crew_outdated from public.events where id = any($1) order by id', [[EVENT.B1, EVENT.B2, EVENT.B3]],
    );
    expect(flags.map((f) => f.crew_outdated)).toEqual([true, false, false]);
    // Semana passada e semana A (publicada, com escala) não mudam de vagas.
    expect(await activeSlots(EVENT.E0)).toEqual(['R1', 'R5']);
    expect(await activeSlots(EVENT.E1)).toEqual(['R1', 'R5']);
  });

  it('IT-020 arquivar T3 deixa os eventos futuros de T3 sem tipo e com certeza baixa', async () => {
    await sql("update public.events set service_type_id = $1, type_certainty = 'media' where id = $2", [type(3), EVENT.B5]);
    expect((await applyOne(as('P1'), op('service_type.archive', { id: type(3) }))).status).toBe('applied');
    expect(await one('select service_type_id, type_certainty from public.events where id = $1', [EVENT.B5]))
      .toEqual({ service_type_id: null, type_certainty: 'baixa' });
  });

  it('IT-092 dois administradores renomeiam R2 em sequência: vale o último e o outro lê o nome novo pelo cursor', async () => {
    const { data: before } = await as('P1').from('job_roles').select('updated_at').order('updated_at', { ascending: false }).limit(1);
    const cursor = before?.[0]?.updated_at as string;
    expect((await applyOne(as('P1'), op('job_role.upsert', { id: role(2), name: 'Áudio direto' }))).status).toBe('applied');
    expect((await applyOne(as('P2'), op('job_role.upsert', { id: role(2), name: 'Som' }))).status).toBe('applied');
    const { data } = await as('P1').from('job_roles').select('id, name, version').gt('updated_at', cursor);
    expect(data).toEqual([{ id: role(2), name: 'Som', version: 3 }]);
  });

  it('IT-093 tipo "gravacao de aula" com T1 "Gravação de aula" devolve name_taken', async () => {
    const res = await applyOne(as('P1'), op('service_type.upsert', { name: 'gravacao  de AULA', crew: [{ job_role_id: role(1), quantity: 1 }] }));
    expect(res).toMatchObject({ status: 'rejected', code: 'name_taken' });
  });
});

describe('apply_ops: ausências', () => {
  useSeed();

  const absence = (overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    person_id: person(5),
    kind: 'ausencia',
    starts_at: '2026-10-22T13:00:00-03:00',
    ends_at: '2026-10-22T15:00:00-03:00',
    ...overrides,
  });

  it('IT-021 ausência que cobre um evento escalado grava absent na alocação e review_pending no evento', async () => {
    expect((await assignmentOf(SLOT.E1_R1)).warnings).toEqual([]);
    expect((await applyOne(as('P1'), op('absence.upsert', absence()))).status).toBe('applied');
    expect((await assignmentOf(SLOT.E1_R1)).warnings).toEqual(['absent']);
    expect(await one('select review_pending from public.events where id = $1', [EVENT.E1])).toEqual({ review_pending: true });
  });

  it('IT-022 arquivar a ausência tira absent dos alertas', async () => {
    const a = absence();
    await applyOne(as('P1'), op('absence.upsert', a));
    expect((await assignmentOf(SLOT.E1_R1)).warnings).toEqual(['absent']);
    expect((await applyOne(as('P1'), op('absence.archive', { id: a.id }))).status).toBe('applied');
    expect((await assignmentOf(SLOT.E1_R1)).warnings).toEqual([]);
  });

  it('IT-094 ausência no passado é aceita', async () => {
    const res = await applyOne(as('P1'), op('absence.upsert', absence({
      kind: 'folga', starts_at: '2026-10-01T00:00:00-03:00', ends_at: '2026-10-03T00:00:00-03:00', all_day: true,
    })));
    expect(res.status).toBe('applied');
    expect(await sql("select * from public.absences where person_id = $1 and starts_at < '2026-10-05'", [person(5)])).toHaveLength(1);
  });

  it('ausência com fim antes do início devolve end_before_start', async () => {
    const res = await applyOne(as('P1'), op('absence.upsert', absence({ ends_at: '2026-10-22T12:00:00-03:00' })));
    expect(res).toMatchObject({ status: 'rejected', code: 'end_before_start' });
  });
});
