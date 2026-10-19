// apply_ops na configuração das agendas (US-009): o administrador informa o ID e liga ou desliga a leitura.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyOne, as, one, op, sql, useSeed } from '../helpers/supabase.ts';

describe('apply_ops: calendar_source.upsert', () => {
  useSeed();

  it('cria a agenda pendente, desliga e liga, e recusa ID repetido ou vazio; a Equipe não grava', async () => {
    const id = randomUUID();
    const created = await applyOne(as('P1'), op('calendar_source.upsert', { id, google_calendar_id: ' Nova.Agenda@gmail.com ', label: '' }));
    expect(created).toMatchObject({ status: 'applied' });
    expect(await one('select google_calendar_id, label, enabled, status from public.calendar_sources where id = $1', [id])).toEqual({
      google_calendar_id: 'nova.agenda@gmail.com', label: 'nova.agenda', enabled: true, status: 'pending',
    });

    expect(await applyOne(as('P1'), op('calendar_source.upsert', { id, enabled: false }))).toMatchObject({ status: 'applied' });
    expect(await one('select enabled, google_calendar_id from public.calendar_sources where id = $1', [id])).toEqual({
      enabled: false, google_calendar_id: 'nova.agenda@gmail.com',
    });

    const dup = await applyOne(as('P1'), op('calendar_source.upsert', { google_calendar_id: 'pecegeworks@gmail.com', label: 'outra' }));
    expect(dup).toMatchObject({ status: 'rejected', code: 'calendar_taken' });
    const empty = await applyOne(as('P1'), op('calendar_source.upsert', { google_calendar_id: '  ', label: 'x' }));
    expect(empty).toMatchObject({ status: 'rejected', code: 'calendar_id_invalid' });

    const team = await applyOne(as('P10'), op('calendar_source.upsert', { google_calendar_id: 'equipe@gmail.com' }));
    expect(team).toMatchObject({ status: 'rejected', code: 'forbidden' });
  });
});

describe('apply_ops: editar e remover agenda (1.0.1)', () => {
  useSeed();
  const WITH_EVENTS = 'f0000000-0000-4000-8000-000000000001';

  it('sem eventos: o ID errado é corrigido e volta a pendente; remover arquiva e libera o ID para um cadastro novo', async () => {
    const id = randomUUID();
    await applyOne(as('P1'), op('calendar_source.upsert', { id, google_calendar_id: 'pcegeworks@gmail.com', label: 'Estúdios' }));
    await sql("update public.calendar_sources set status = 'error', last_error = 'Sem acesso à agenda', last_synced_at = now() where id = $1", [id]);

    expect(await applyOne(as('P1'), op('calendar_source.upsert', { id, google_calendar_id: 'estudios.pecege@gmail.com', label: 'Estúdios' }))).toMatchObject({ status: 'applied' });
    expect(await one('select google_calendar_id, status, last_error, last_synced_at from public.calendar_sources where id = $1', [id])).toEqual({
      google_calendar_id: 'estudios.pecege@gmail.com', status: 'pending', last_error: null, last_synced_at: null,
    });

    expect(await applyOne(as('P1'), op('calendar_source.remove', { id }))).toMatchObject({ status: 'applied' });
    const removed = await one<{ archived_at: string | null; enabled: boolean }>('select archived_at, enabled from public.calendar_sources where id = $1', [id]);
    expect(removed.archived_at).not.toBeNull();
    expect(removed.enabled).toBe(false);
    // Remover de novo não falha (a fila pode reenviar), e a agenda removida não se edita mais.
    expect(await applyOne(as('P1'), op('calendar_source.remove', { id }))).toMatchObject({ status: 'applied' });
    expect(await applyOne(as('P1'), op('calendar_source.upsert', { id, label: 'outra' }))).toMatchObject({ status: 'rejected', code: 'calendar_source_removed' });

    const again = await applyOne(as('P1'), op('calendar_source.upsert', { google_calendar_id: 'estudios.pecege@gmail.com', label: 'Estúdios' }));
    expect(again).toMatchObject({ status: 'applied' });
  });

  it('com eventos: o rótulo muda, o ID não, e remover é recusado; a Equipe não remove', async () => {
    expect(await applyOne(as('P1'), op('calendar_source.upsert', { id: WITH_EVENTS, label: 'Estúdios' }))).toMatchObject({ status: 'applied' });
    expect(await one('select label, google_calendar_id, status from public.calendar_sources where id = $1', [WITH_EVENTS])).toEqual({
      label: 'Estúdios', google_calendar_id: 'pecegeworks@gmail.com', status: 'connected',
    });

    const idChange = await applyOne(as('P1'), op('calendar_source.upsert', { id: WITH_EVENTS, google_calendar_id: 'outra@gmail.com' }));
    expect(idChange).toMatchObject({ status: 'rejected', code: 'calendar_has_events' });
    const remove = await applyOne(as('P1'), op('calendar_source.remove', { id: WITH_EVENTS }));
    expect(remove).toMatchObject({ status: 'rejected', code: 'calendar_has_events' });
    expect(await one('select archived_at, google_calendar_id from public.calendar_sources where id = $1', [WITH_EVENTS])).toEqual({
      archived_at: null, google_calendar_id: 'pecegeworks@gmail.com',
    });

    expect(await applyOne(as('P1'), op('calendar_source.remove', { id: randomUUID() }))).toMatchObject({ status: 'rejected', code: 'not_found' });
    expect(await applyOne(as('P10'), op('calendar_source.remove', { id: WITH_EVENTS }))).toMatchObject({ status: 'rejected', code: 'forbidden' });
  });
});
