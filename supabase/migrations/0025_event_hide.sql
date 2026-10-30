-- Apagar a atividade pelo painel da Semana (1.1.2). Pedido do Raoni em 29/10/2026: o evento some da grade; como o
-- app só lê o Google Agenda, a releitura não o traz de volta, e o app avisa depois de reler o que foi apagado aqui e
-- segue na agenda, para manter fora ou trazer de volta.
--   - events.hidden_at e hidden_by: quem apagou e quando. O evento apagado fica com ignored = true (some da grade, da
--     montagem, da publicação e da equipe, como o duplicado ignorado); a releitura não mexe em ignored;
--   - event.hide: libera e arquiva as vagas e esconde o evento (agenda ou interna);
--   - event.unhide: traz de volta e, com a semana montada e não passada, recria as vagas pela equipe do tipo.
-- Sem dados mudados. Desfazer: supabase/rollback/0025_down.sql.

alter table public.events
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.people (id);

create function public.op_event_hide(pl jsonb, p_base int, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  s record;
  v_version int;
begin
  select * into e from public.events where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Evento não encontrado.');
  end if;
  perform public.check_base(p_base, e.version, to_jsonb(e), pl);
  perform public.assert_week_open(e.week_start);
  if e.hidden_at is not null then
    return jsonb_build_object('status', 'applied', 'version', e.version);
  end if;
  for s in select id from public.slots where event_id = e.id and archived_at is null loop
    perform public.open_slot(s.id);
    update public.slots set archived_at = now() where id = s.id;
  end loop;
  update public.events set ignored = true, hidden_at = now(), hidden_by = me where id = e.id
  returning version into v_version;
  perform public.mark_week_dirty(e.week_start);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create function public.op_event_unhide(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_version int;
begin
  select * into e from public.events where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Evento não encontrado.');
  end if;
  perform public.check_base(p_base, e.version, to_jsonb(e), pl);
  perform public.assert_week_open(e.week_start);
  if e.hidden_at is null then
    return jsonb_build_object('status', 'applied', 'version', e.version);
  end if;
  update public.events set ignored = false, hidden_at = null, hidden_by = null where id = e.id;
  if exists (select 1 from public.weeks w where w.week_start = e.week_start) and not public.is_week_past(e.week_start) then
    perform public.rebuild_event_slots(e.id);
    perform public.mark_week_dirty(e.week_start);
  end if;
  select version into v_version from public.events where id = e.id;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

revoke execute on function public.op_event_hide(jsonb, int, uuid) from public, anon, authenticated;
revoke execute on function public.op_event_unhide(jsonb, int) from public, anon, authenticated;

-- Igual à 0011, mais event.hide e event.unhide.
create or replace function public.apply_op(op jsonb, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  k text := op ->> 'kind';
  pl jsonb := coalesce(op -> 'payload', '{}');
  b int := case when jsonb_typeof(op -> 'baseVersion') = 'number' then (op ->> 'baseVersion')::int end;
begin
  if jsonb_typeof(pl) <> 'object' then
    perform public.fail('invalid_op', 'Operação sem dados.');
  end if;
  return case k
    when 'person.upsert' then public.op_person_upsert(pl, me)
    when 'person.deactivate' then public.op_person_deactivate(pl, me)
    when 'person.reactivate' then public.op_person_reactivate(pl, me)
    when 'absence.upsert' then public.op_absence_upsert(pl)
    when 'absence.archive' then public.op_absence_archive(pl)
    when 'sector.upsert' then public.op_sector_upsert(pl)
    when 'sector.archive' then public.op_archive('sectors', pl)
    when 'job_role.upsert' then public.op_job_role_upsert(pl)
    when 'job_role.archive' then public.op_archive('job_roles', pl)
    when 'service_type.upsert' then public.op_service_type_upsert(pl)
    when 'service_type.archive' then public.op_service_type_archive(pl)
    when 'calendar_source.upsert' then public.op_calendar_source_upsert(pl)
    when 'calendar_source.remove' then public.op_calendar_source_remove(pl)
    when 'event.update_extras' then public.op_event_update_extras(pl, b)
    when 'event.internal_upsert' then public.op_event_internal_upsert(pl, b)
    when 'event.internal_cancel' then public.op_event_internal_cancel(pl, b)
    when 'event.mark_reviewed' then public.op_event_mark_reviewed(pl, b)
    when 'event.resolve_duplicate' then public.op_event_resolve_duplicate(pl, b)
    when 'event.hide' then public.op_event_hide(pl, b, me)
    when 'event.unhide' then public.op_event_unhide(pl, b)
    when 'week.build' then public.op_week_build(pl, b)
    when 'slot.add' then public.op_slot_add(pl, b)
    when 'slot.remove' then public.op_slot_remove(pl, b)
    when 'assignment.set' then public.op_assignment_set(pl, b, me)
    when 'assignment.clear' then public.op_assignment_clear(pl, b)
    when 'assignment.lock' then public.op_assignment_lock(pl, b)
    when 'assignment.accept' then public.op_assignment_accept(pl, b, me)
    when 'assignment.discard' then public.op_assignment_discard(pl, b)
    when 'settings.update' then public.op_settings_update(pl)
    else public.op_unknown(k)
  end;
end;
$$;
