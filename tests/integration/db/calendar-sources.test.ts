// apply_ops na configuração das agendas (US-009): o administrador informa o ID e liga ou desliga a leitura.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyOne, as, one, op, useSeed } from '../helpers/supabase.ts';

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
