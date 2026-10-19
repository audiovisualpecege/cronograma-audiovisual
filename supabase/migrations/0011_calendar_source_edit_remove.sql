-- Editar e remover agendas na Configuração (1.0.1). O rótulo muda sempre; o ID só enquanto a agenda não tem
-- eventos lidos, porque com o ID novo o serviço de fundo daria os eventos antigos como cancelados e avisaria a
-- equipe. Remover só vale para agenda sem eventos e arquiva a linha (archived_at): um delete não chegaria às
-- cópias locais, que leem só o que mudou. Agenda com histórico fica com a leitura desligada.

alter table public.calendar_sources add column archived_at timestamptz;

-- O ID de uma agenda removida pode voltar num cadastro novo.
alter table public.calendar_sources drop constraint calendar_sources_google_calendar_id_key;
create unique index calendar_sources_google_calendar_id_active on public.calendar_sources (google_calendar_id)
  where archived_at is null;

create or replace function public.op_calendar_source_upsert(pl jsonb) returns jsonb
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
  if v_current.archived_at is not null then
    perform public.fail('calendar_source_removed', 'Esta agenda foi removida.');
  end if;
  if v_current.id is not null and not (pl ? 'google_calendar_id') then
    v_cal := v_current.google_calendar_id;
  end if;
  if v_cal = '' or v_cal ~ '\s' then
    perform public.fail('calendar_id_invalid', 'Informe o ID da agenda, como aparece nas configurações da Google Agenda.');
  end if;
  if exists (select 1 from public.calendar_sources s where s.google_calendar_id = v_cal and s.id <> v_id and s.archived_at is null) then
    perform public.fail('calendar_taken', 'Esta agenda já está na lista.');
  end if;
  if v_current.id is not null and v_cal <> v_current.google_calendar_id
     and exists (select 1 from public.events e where e.calendar_source_id = v_id) then
    perform public.fail('calendar_has_events', 'Esta agenda já tem eventos lidos e o ID não pode mudar. Desligue a leitura e adicione a agenda certa como nova.');
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
      last_synced_at = case when v_cal <> v_current.google_calendar_id then null else last_synced_at end,
      last_error = case when v_cal <> v_current.google_calendar_id then null else last_error end
    where id = v_id
    returning version into v_version;
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

create function public.op_calendar_source_remove(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (pl ->> 'id')::uuid;
  v_current public.calendar_sources;
  v_version int;
begin
  select * into v_current from public.calendar_sources where id = v_id;
  if v_current.id is null then
    perform public.fail('not_found', 'Agenda não encontrada.');
  end if;
  if v_current.archived_at is not null then
    return jsonb_build_object('status', 'applied', 'version', v_current.version);
  end if;
  if exists (select 1 from public.events e where e.calendar_source_id = v_id) then
    perform public.fail('calendar_has_events', 'Esta agenda já tem eventos lidos e não pode ser removida. Desligue a leitura para guardar o histórico.');
  end if;
  update public.calendar_sources set archived_at = now(), enabled = false
  where id = v_id
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version);
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
    when 'calendar_source.remove' then public.op_calendar_source_remove(pl)
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
revoke execute on function public.op_calendar_source_remove(jsonb) from public, anon, authenticated;
grant execute on function public.op_calendar_source_remove(jsonb) to service_role;
