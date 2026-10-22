-- Desfaz a migração 0016_role_priority_level.sql: volta op_person_upsert (como na 0004) e
-- op_service_type_upsert (como na 0013) e tira as colunas de prioridade, nível e trabalho complexo. A ordem e o
-- nível das funções de cada pessoa e a marca de complexo se perdem. Ver docs/publicar-1.1.0.md.
-- Depois de rodar: npx supabase migration repair --status reverted 0016

begin;

create or replace function public.op_person_upsert(pl jsonb, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_name text := public.clean_name(pl ->> 'name');
  v_email text := lower(btrim(coalesce(pl ->> 'email', '')));
  v_limit numeric := coalesce(nullif(btrim(pl ->> 'weekly_limit_hours'), '')::numeric, 44);
  v_roles uuid[] := array(select jsonb_array_elements_text(coalesce(pl -> 'role_ids', '[]'))::uuid);
  v_version int;
begin
  if v_name = '' then
    perform public.fail('name_required', 'Informe o nome.');
  end if;
  if v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' then
    perform public.fail('email_invalid', 'E-mail inválido.');
  end if;
  if v_limit < 1 or v_limit > 80 then
    perform public.fail('invalid_limit', 'O limite semanal vai de 1 a 80 horas.');
  end if;
  if cardinality(v_roles) = 0 then
    perform public.fail('roles_required', 'Escolha ao menos uma função.');
  end if;
  if exists (select 1 from public.people p where p.email = v_email::extensions.citext and p.id <> v_id) then
    perform public.fail('email_taken', 'Já existe uma pessoa com este e-mail.');
  end if;

  if exists (select 1 from public.people p where p.id = v_id) then
    update public.people set
      name = v_name,
      email = v_email,
      sector_id = case when pl ? 'sector_id' then (pl ->> 'sector_id')::uuid else sector_id end,
      profile = coalesce(pl ->> 'profile', profile),
      weekly_limit_hours = v_limit
    where id = v_id
    returning version into v_version;
  else
    insert into public.people (id, name, email, sector_id, profile, weekly_limit_hours)
    values (v_id, v_name, v_email, (pl ->> 'sector_id')::uuid, coalesce(pl ->> 'profile', 'team'), v_limit)
    returning version into v_version;
    perform public.enqueue_job('invite', jsonb_build_object('person_id', v_id), v_id::text, me);
  end if;

  insert into public.person_roles (person_id, job_role_id)
  select v_id, r from unnest(v_roles) r
  on conflict (person_id, job_role_id) do update set archived_at = null
  where public.person_roles.archived_at is not null;
  update public.person_roles set archived_at = now()
  where person_id = v_id and archived_at is null and job_role_id <> all (v_roles);

  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

create or replace function public.op_service_type_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_name text := public.clean_name(pl ->> 'name');
  v_crew jsonb := coalesce(pl -> 'crew', '[]');
  v_no_team boolean := coalesce((pl ->> 'no_team')::boolean, false);
  v_icon text := nullif(btrim(coalesce(pl ->> 'icon', '')), '');
  v_existed boolean;
  v_before text;
  v_before_no_team boolean;
  v_version int;
begin
  if v_name = '' then
    perform public.fail('name_required', 'Informe o nome.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_crew) c
    where (c ->> 'quantity') is null or (c ->> 'quantity')::numeric not between 1 and 30
      or (c ->> 'quantity')::numeric <> trunc((c ->> 'quantity')::numeric)
  ) then
    perform public.fail('invalid_quantity', 'A quantidade por função vai de 1 a 30.');
  end if;
  if jsonb_array_length(v_crew) = 0 and not v_no_team then
    perform public.fail('type_without_crew', 'Escolha ao menos uma função ou marque "não exige equipe".');
  end if;
  if exists (select 1 from public.service_types t where public.norm_name(t.name) = public.norm_name(v_name) and t.id <> v_id) then
    perform public.fail('name_taken', 'Já existe um tipo de serviço com este nome.');
  end if;
  if v_icon is not null and v_icon !~ '^[a-z0-9-]{1,40}$' then
    perform public.fail('invalid_icon', 'Ícone inválido.');
  end if;

  select true, public.crew_signature(t.id), t.no_team into v_existed, v_before, v_before_no_team
  from public.service_types t where t.id = v_id;

  insert into public.service_types (id, name, keywords, no_team, icon)
  values (
    v_id, v_name,
    array(select distinct btrim(k) from jsonb_array_elements_text(coalesce(pl -> 'keywords', '[]')) k where btrim(k) <> ''),
    v_no_team, v_icon
  )
  on conflict (id) do update set
    name = excluded.name, keywords = excluded.keywords, no_team = excluded.no_team,
    -- Pedido sem a chave "icon" (aparelho com a versão anterior) mantém o ícone gravado.
    icon = case when pl ? 'icon' then excluded.icon else public.service_types.icon end
  returning version into v_version;

  insert into public.service_type_crew (service_type_id, job_role_id, quantity)
  select v_id, (c ->> 'job_role_id')::uuid, (c ->> 'quantity')::int from jsonb_array_elements(v_crew) c
  on conflict (service_type_id, job_role_id) do update set quantity = excluded.quantity, archived_at = null
  where public.service_type_crew.quantity <> excluded.quantity or public.service_type_crew.archived_at is not null;
  update public.service_type_crew set archived_at = now()
  where service_type_id = v_id and archived_at is null
    and job_role_id not in (select (c ->> 'job_role_id')::uuid from jsonb_array_elements(v_crew) c);

  if v_existed and (v_before is distinct from public.crew_signature(v_id) or v_before_no_team <> v_no_team) then
    perform public.apply_crew_change(v_id);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

alter table public.person_roles drop column priority, drop column level;
alter table public.service_types drop column complex;

commit;
