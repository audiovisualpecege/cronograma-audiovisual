-- Desfaz a migração 0018_disponibilizador.sql com a cópia em public._backup_0018. Ver docs/publicar-1.1.0.md.
-- Rode antes do 0017_down.sql (este usa a coluna "size" da equipe).
--   1. as funções voltam ao que eram (check_eligibility da 0005 e op_job_role_upsert da 0004);
--   2. os eventos que passaram para DISPONIBILIZAR voltam ao tipo que tinham;
--   3. o DISPONIBILIZAR volta a não exigir equipe, com as palavras-chave e a equipe de antes;
--   4. quem ganhou Disponibilizador pela 0018 perde a função, e a função criada pela 0018 é apagada, ou arquivada
--      se alguém já a usa;
--   5. sai a coluna no_hours, e as vagas do DISPONIBILIZAR sem ninguém escalado são refeitas.
-- Depois de rodar: npx supabase migration repair --status reverted 0018

begin;

-- 1. Funções.
create or replace function public.op_job_role_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_name text := public.clean_name(pl ->> 'name');
  v_version int;
begin
  if v_name = '' then
    perform public.fail('name_required', 'Informe o nome.');
  end if;
  if exists (select 1 from public.job_roles r where public.norm_name(r.name) = public.norm_name(v_name) and r.id <> v_id) then
    perform public.fail('name_taken', 'Já existe uma função com este nome.');
  end if;
  insert into public.job_roles (id, name, sector_id) values (v_id, v_name, (pl ->> 'sector_id')::uuid)
  on conflict (id) do update set
    name = excluded.name,
    sector_id = case when pl ? 'sector_id' then excluded.sector_id else public.job_roles.sector_id end
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

create or replace function public.check_eligibility(p_person uuid, p_slot uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  p public.people;
  s public.slots;
  e public.events;
  busy tstzrange;
  load numeric;
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
  if exists (
    select 1 from public.assignments a join public.events o on o.id = a.event_id
    where a.person_id = p_person and a.slot_id <> p_slot and o.id <> e.id and o.status <> 'cancelled'
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

  -- Carga da semana do evento sem esta vaga; cada evento conta uma vez.
  select coalesce(sum(public.event_hours(o)), 0) into load
  from public.events o
  where o.week_start = e.week_start and o.status <> 'cancelled'
    and exists (
      select 1 from public.assignments a
      where a.event_id = o.id and a.person_id = p_person and a.slot_id <> p_slot
    );
  if load + public.event_hours(e) > p.weekly_limit_hours then
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

drop function public.slot_no_hours(uuid);

-- 2. Tipo dos eventos movidos.
update public.events e
set service_type_id = (b.data ->> 'service_type_id')::uuid,
    type_source = b.data ->> 'type_source',
    type_certainty = b.data ->> 'type_certainty'
from public._backup_0018 b
where b.kind = 'event_type' and e.id = b.ref;

-- 3. DISPONIBILIZAR como era.
update public.service_types t
set keywords = array(select jsonb_array_elements_text(b.data -> 'keywords')),
    no_team = (b.data ->> 'no_team')::boolean
from public._backup_0018 b
where b.kind = 'service_type' and t.id = b.ref;

update public.service_type_crew c set archived_at = now()
where c.archived_at is null and c.service_type_id in (select ref from public._backup_0018 where kind = 'service_type');

update public.service_type_crew c
set archived_at = null, quantity = (b.data ->> 'quantity')::int
from public._backup_0018 b
where b.kind = 'crew' and c.id = (b.data ->> 'id')::uuid;

-- 4. A função dada pela 0018 a quem tem Operador Aula sai (arquivada, para os aparelhos verem). A função criada
-- pela 0018: apagada se nada a usa, senão arquivada. A que já existia volta ao que era.
update public.person_roles pr set archived_at = coalesce(pr.archived_at, now())
from public._backup_0018 b
where b.kind = 'given_role' and pr.id = b.ref;

delete from public.service_type_crew c using public._backup_0018 b
where b.kind = 'created_role' and c.job_role_id = b.ref
  and not exists (select 1 from public.slots s where s.job_role_id = b.ref)
  and not exists (select 1 from public.person_roles pr where pr.job_role_id = b.ref)
  and not exists (select 1 from public.history_entries h where h.job_role_id = b.ref);
delete from public.job_roles r using public._backup_0018 b
where b.kind = 'created_role' and r.id = b.ref
  and not exists (select 1 from public.slots s where s.job_role_id = r.id)
  and not exists (select 1 from public.person_roles pr where pr.job_role_id = r.id)
  and not exists (select 1 from public.service_type_crew c where c.job_role_id = r.id)
  and not exists (select 1 from public.history_entries h where h.job_role_id = r.id);
update public.job_roles r set archived_at = coalesce(r.archived_at, now())
from public._backup_0018 b
where b.kind = 'created_role' and r.id = b.ref;
update public.job_roles r set archived_at = (b.data ->> 'archived_at')::timestamptz
from public._backup_0018 b
where b.kind = 'role' and r.id = b.ref;

-- 5. Coluna e vagas.
alter table public.job_roles drop column no_hours;

do $$
declare ev record;
begin
  for ev in
    select e.id, e.week_start from public.events e
    where e.service_type_id in (select ref from public._backup_0018 where kind = 'service_type')
      and e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start)
      and exists (select 1 from public.weeks w where w.week_start = e.week_start)
      and not public.event_has_people(e.id)
  loop
    perform public.rebuild_event_slots(ev.id);
    perform public.mark_week_dirty(ev.week_start);
  end loop;
end;
$$;

update public.events e set crew_outdated = false
from public._backup_0018 b
where b.kind = 'event_outdated' and e.id = b.ref;

-- A cópia fica até alguém conferir; apague à mão depois: drop table public._backup_0018;

commit;
