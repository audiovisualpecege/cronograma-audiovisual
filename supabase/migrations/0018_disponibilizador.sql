-- Disponibilizador (1.1.0). O DISPONIBILIZAR volta a pedir equipe: 1 Disponibilizador, uma função nova que não
-- ocupa horário (subir o vídeo se faz a qualquer hora). Pedido do Raoni em 26/10/2026.
--   - job_roles.no_hours: a vaga da função não soma horas na carga da pessoa e não bate horário com as outras
--     atividades dela (nos dois sentidos). Ausência continua valendo. Espelha checkEligibility do core;
--   - job_role.upsert recebe "no_hours" (sem a chave, mantém o gravado);
--   - título que começa com "*DISPONIBILIZAR" vira DISPONIBILIZAR com certeza alta: a palavra-chave com asterisco
--     "*disponibilizar" (classifyTitle do core). Os eventos de agora em diante com esse começo mudam de tipo aqui.
-- A 0013 tinha deixado o DISPONIBILIZAR sem equipe; esta volta atrás com a função nova, dada a quem tem
-- Operador Aula (quem tinha a vaga do DISPONIBILIZAR antes).
-- Tudo o que muda fica antes em public._backup_0018, para supabase/rollback/0018_down.sql.

alter table public.job_roles add column no_hours boolean not null default false;

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
  insert into public.job_roles (id, name, sector_id, no_hours)
  values (v_id, v_name, (pl ->> 'sector_id')::uuid, coalesce((pl ->> 'no_hours')::boolean, false))
  on conflict (id) do update set
    name = excluded.name,
    sector_id = case when pl ? 'sector_id' then excluded.sector_id else public.job_roles.sector_id end,
    -- Pedido sem a chave (aparelho com a versão anterior) mantém o valor gravado.
    no_hours = case when pl ? 'no_hours' then excluded.no_hours else public.job_roles.no_hours end
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

-- Vaga de função que não ocupa horário.
create function public.slot_no_hours(p_slot uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select r.no_hours from public.slots s join public.job_roles r on r.id = s.job_role_id where s.id = p_slot), false)
$$;

-- Igual à 0005, com a função que não ocupa horário: sem "horário sobreposto" e sem horas na carga.
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

  -- Carga da semana do evento sem esta vaga; cada evento conta uma vez; vaga que não ocupa horário não soma.
  select coalesce(sum(public.event_hours(o)), 0) into load
  from public.events o
  where o.week_start = e.week_start and o.status <> 'cancelled'
    and exists (
      select 1 from public.assignments a
      where a.event_id = o.id and a.person_id = p_person and a.slot_id <> p_slot
        and not public.slot_no_hours(a.slot_id)
    );
  if load + (case when free then 0 else public.event_hours(e) end) > p.weekly_limit_hours then
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

-- ---------------------------------------------------------------------------------------------
-- Dados. A cópia (public._backup_0018) fica fechada pela RLS, sem política: ninguém lê pela API.

create table public._backup_0018 (
  kind text not null,  -- service_type | crew | created_role | role | given_role | event_type | event_outdated
  ref uuid not null,
  data jsonb,
  saved_at timestamptz not null default now()
);
alter table public._backup_0018 enable row level security;
revoke all on public._backup_0018 from anon, authenticated;

insert into public._backup_0018 (kind, ref, data)
select 'service_type', t.id, to_jsonb(t) from public.service_types t where public.norm_name(t.name) = 'disponibilizar';

insert into public._backup_0018 (kind, ref, data)
select 'crew', c.service_type_id, to_jsonb(c) from public.service_type_crew c
join public.service_types t on t.id = c.service_type_id
where public.norm_name(t.name) = 'disponibilizar' and c.archived_at is null;

insert into public._backup_0018 (kind, ref, data)
select 'role', r.id, to_jsonb(r) from public.job_roles r where public.norm_name(r.name) = 'disponibilizador';

-- A função, no setor do Operador Aula (quem disponibilizava até aqui), que não ocupa horário.
with created as (
  insert into public.job_roles (name, sector_id, no_hours)
  select 'Disponibilizador', (select r.sector_id from public.job_roles r where public.norm_name(r.name) = 'operador aula' and r.archived_at is null limit 1), true
  where not exists (select 1 from public.job_roles r where public.norm_name(r.name) = 'disponibilizador')
  returning id
)
insert into public._backup_0018 (kind, ref) select 'created_role', id from created;

update public.job_roles set no_hours = true, archived_at = null where public.norm_name(name) = 'disponibilizador';

-- Quem tem Operador Aula ganha Disponibilizador, por último na ordem das funções (o histórico não diz quem
-- disponibiliza hoje: em 705 dos 901 eventos ninguém foi escalado; o Raoni escolheu assim em 26/10/2026).
with given as (
  insert into public.person_roles (person_id, job_role_id, priority, level)
  select pr.person_id, d.id,
    (select coalesce(max(x.priority), count(*)) + 1 from public.person_roles x where x.person_id = pr.person_id and x.archived_at is null),
    2
  from public.person_roles pr
  join public.people p on p.id = pr.person_id and p.active
  join public.job_roles a on a.id = pr.job_role_id and public.norm_name(a.name) = 'operador aula'
  cross join (select id from public.job_roles where public.norm_name(name) = 'disponibilizador' limit 1) d
  where pr.archived_at is null
    and not exists (select 1 from public.person_roles y where y.person_id = pr.person_id and y.job_role_id = d.id)
  returning id
)
insert into public._backup_0018 (kind, ref) select 'given_role', id from given;

-- DISPONIBILIZAR: 1 Disponibilizador e a palavra-chave com asterisco. Os eventos de agora em diante com
-- "*DISPONIBILIZAR" no começo do título passam para o tipo; depois as vagas das semanas montadas são refeitas
-- onde ninguém foi escalado ("equipe típica mudou" onde já tem gente).
do $$
declare
  t uuid;
  v_role uuid;
  ev record;
begin
  select id into t from public.service_types where public.norm_name(name) = 'disponibilizar' and archived_at is null limit 1;
  select id into v_role from public.job_roles where public.norm_name(name) = 'disponibilizador' limit 1;
  if t is null or v_role is null then
    return;
  end if;

  update public.service_types
  set no_team = false,
      keywords = array(select distinct k from unnest(keywords || array['*disponibilizar']) k)
  where id = t;
  update public.service_type_crew set archived_at = now() where service_type_id = t and archived_at is null;
  insert into public.service_type_crew (service_type_id, job_role_id, size, quantity)
  values (t, v_role, 2, 1)
  on conflict (service_type_id, size, job_role_id) do update set quantity = 1, archived_at = null;

  with moved as (
    select e.id, jsonb_build_object('service_type_id', e.service_type_id, 'type_source', e.type_source, 'type_certainty', e.type_certainty) as old
    from public.events e
    where btrim(e.title) ~* '^\*\s*disponibilizar\M'
      and e.service_type_id is distinct from t
      and e.week_start >= public.monday_of(current_date) and e.status <> 'cancelled'
  ),
  saved as (
    insert into public._backup_0018 (kind, ref, data) select 'event_type', id, old from moved
  )
  update public.events e set service_type_id = t, type_source = 'keyword', type_certainty = 'alta'
  from moved m where e.id = m.id;

  for ev in
    select e.id, e.week_start, public.event_has_people(e.id) as has_people
    from public.events e
    where e.service_type_id = t and e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start)
      and exists (select 1 from public.weeks w where w.week_start = e.week_start)
  loop
    if ev.has_people then
      insert into public._backup_0018 (kind, ref)
      select 'event_outdated', ev.id from public.events x where x.id = ev.id and not x.crew_outdated;
      update public.events set crew_outdated = true where id = ev.id;
    else
      perform public.rebuild_event_slots(ev.id);
    end if;
    perform public.mark_week_dirty(ev.week_start);
  end loop;
end;
$$;
