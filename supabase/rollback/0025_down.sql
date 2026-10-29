-- Desfaz a 0025: os eventos apagados pelo painel voltam (sem vagas; "Montar semana" ou "Criar as vagas" as recriam),
-- o apply_op volta ao da 0011 e as funções e colunas novas saem.
begin;

update public.events set ignored = false where hidden_at is not null;

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

drop function public.op_event_hide(jsonb, int, uuid);
drop function public.op_event_unhide(jsonb, int);
alter table public.events drop column hidden_at, drop column hidden_by;

commit;
