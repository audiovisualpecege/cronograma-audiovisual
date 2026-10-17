-- Configuração das agendas pelo app (US-009): o administrador informa o ID e o rótulo de cada Google Agenda e
-- liga ou desliga a leitura. Vai pela fila como os outros cadastros (baseVersion nulo, a última gravação vale).
-- O estado, a última leitura e o erro continuam só do serviço de fundo.

create function public.op_calendar_source_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_cal text := lower(btrim(coalesce(pl ->> 'google_calendar_id', '')));
  v_label text := public.clean_name(pl ->> 'label');
  v_current public.calendar_sources;
  v_version int;
begin
  select * into v_current from public.calendar_sources where id = v_id;
  if v_current.id is not null and not (pl ? 'google_calendar_id') then
    v_cal := v_current.google_calendar_id;
  end if;
  if v_cal = '' or v_cal ~ '\s' then
    perform public.fail('calendar_id_invalid', 'Informe o ID da agenda, como aparece nas configurações da Google Agenda.');
  end if;
  if exists (select 1 from public.calendar_sources s where s.google_calendar_id = v_cal and s.id <> v_id) then
    perform public.fail('calendar_taken', 'Esta agenda já está na lista.');
  end if;
  if v_label = '' then
    v_label := coalesce(v_current.label, split_part(v_cal, '@', 1));
  end if;

  if v_current.id is null then
    insert into public.calendar_sources (id, google_calendar_id, label, enabled)
    values (v_id, v_cal, v_label, coalesce((pl ->> 'enabled')::boolean, true))
    returning version into v_version;
  else
    update public.calendar_sources set
      google_calendar_id = v_cal,
      label = v_label,
      enabled = coalesce((pl ->> 'enabled')::boolean, enabled),
      -- ID novo: a agenda ainda não foi lida com ele.
      status = case when v_cal <> v_current.google_calendar_id then 'pending' else status end,
      last_error = case when v_cal <> v_current.google_calendar_id then null else last_error end
    where id = v_id
    returning version into v_version;
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

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
    when 'event.update_extras' then public.op_event_update_extras(pl, b)
    when 'event.internal_upsert' then public.op_event_internal_upsert(pl, b)
    when 'event.internal_cancel' then public.op_event_internal_cancel(pl, b)
    when 'event.mark_reviewed' then public.op_event_mark_reviewed(pl, b)
    when 'event.resolve_duplicate' then public.op_event_resolve_duplicate(pl, b)
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

revoke execute on function public.op_calendar_source_upsert(jsonb) from public, anon, authenticated;
grant execute on function public.op_calendar_source_upsert(jsonb) to service_role;

-- O serviço de fundo grava o estado das agendas e o final da chave da IA: o aviso do Realtime faz a tela de
-- configuração ler a linha nova sem recarregar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.calendar_sources, public.settings;
  end if;
end;
$$;
