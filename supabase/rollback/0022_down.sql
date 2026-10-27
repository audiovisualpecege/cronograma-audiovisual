-- Desfaz a migração 0022_base_work_hours.sql. Ver docs/publicar-1.1.0.md. Rode antes do 0021_down.sql.
-- As funções voltam ao que eram (op_person_upsert da 0016, op_service_type_upsert da 0019, check_eligibility da
-- 0018 e warning_label da 0004) e saem as colunas de sede, horário e "externo". Os alertas off_hours e other_base
-- já gravados nas alocações ficam até a próxima mudança delas.
-- Depois de rodar: npx supabase migration repair --status reverted 0022

begin;

drop function public.op_person_upsert(jsonb, uuid);
alter function public.op_person_upsert_base(jsonb, uuid) rename to op_person_upsert;

drop function public.op_service_type_upsert(jsonb);
alter function public.op_service_type_upsert_sectors(jsonb) rename to op_service_type_upsert;

create or replace function public.check_eligibility(p_person uuid, p_slot uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  p public.people;
  s public.slots;
  e public.events;
  busy tstzrange;
  load numeric;
  free boolean;
  blockers text[] := '{}';
  warnings text[] := '{}';
begin
  select * into p from public.people where id = p_person;
  if not found then
    perform public.fail('not_found', 'Pessoa não encontrada.');
  end if;
  select * into s from public.slots where id = p_slot;
  if not found then
    perform public.fail('not_found', 'Vaga não encontrada.');
  end if;
  select * into e from public.events where id = s.event_id;
  free := public.slot_no_hours(p_slot);

  if not p.active then blockers := array_append(blockers, 'person_inactive'); end if;
  if e.status = 'cancelled' then blockers := array_append(blockers, 'event_cancelled'); end if;
  if exists (
    select 1 from public.assignments a
    where a.person_id = p_person and a.event_id = e.id and a.slot_id <> p_slot
  ) then
    blockers := array_append(blockers, 'same_event_twice');
  end if;
  if public.is_week_past(e.week_start) then blockers := array_append(blockers, 'week_past'); end if;

  busy := public.event_busy(e);
  if not free and exists (
    select 1 from public.assignments a join public.events o on o.id = a.event_id
    where a.person_id = p_person and a.slot_id <> p_slot and o.id <> e.id and o.status <> 'cancelled'
      and not public.slot_no_hours(a.slot_id)
      and public.event_busy(o) && busy
  ) then
    warnings := array_append(warnings, 'overlap');
  end if;

  if exists (
    select 1 from public.absences ab
    where ab.person_id = p_person and ab.archived_at is null
      and tstzrange(ab.starts_at, ab.ends_at, '[)') && busy
  ) then
    warnings := array_append(warnings, 'absent');
  end if;

  select coalesce(sum(public.event_hours(o)), 0) into load
  from public.events o
  where o.week_start = e.week_start and o.status <> 'cancelled'
    and exists (
      select 1 from public.assignments a
      where a.event_id = o.id and a.person_id = p_person and a.slot_id <> p_slot
        and not public.slot_no_hours(a.slot_id)
    );
  if load + case when free then 0 else public.event_hours(e) end > p.weekly_limit_hours then
    warnings := array_append(warnings, 'over_limit');
  end if;

  if not exists (
    select 1 from public.person_roles pr
    where pr.person_id = p_person and pr.job_role_id = s.job_role_id and pr.archived_at is null
  ) then
    warnings := array_append(warnings, 'role_not_enabled');
  end if;

  return jsonb_build_object(
    'ok', cardinality(blockers) = 0 and cardinality(warnings) = 0,
    'blockers', to_jsonb(blockers),
    'warnings', to_jsonb(warnings)
  );
end;
$$;

create or replace function public.warning_label(code text) returns text
language sql immutable set search_path = ''
as $$
  select case code
    when 'overlap' then 'horário sobreposto'
    when 'absent' then 'pessoa ausente'
    when 'over_limit' then 'passa do limite semanal'
    when 'role_not_enabled' then 'função não habilitada'
    else code
  end
$$;

drop function public.outside_work_hours(jsonb, timestamptz, timestamptz);
alter table public.service_types drop column external;
alter table public.people drop column work_hours, drop column base;

-- A cópia fica até alguém conferir; apague à mão depois: drop table public._backup_0022;

commit;
