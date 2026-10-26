-- Desfaz a migração 0017_event_size.sql com a cópia em public._backup_0017. Ver docs/publicar-1.1.0.md.
--   1. as funções voltam ao que eram (crew_signature da 0004, create_event_slots da 0005,
--      op_service_type_upsert da 0016 e op_event_update_extras da 0013);
--   2. as equipes dos portes Simples e Grande são apagadas e EVENTO, GRAVACAO, PODCAST e TRANSMISSAO voltam à
--      equipe típica de antes;
--   3. saem as colunas de porte (o porte escolhido em cada evento se perde);
--   4. as vagas dos eventos desses tipos sem ninguém escalado são refeitas pela equipe antiga, e o aviso
--      "equipe típica mudou" que a 0017 pôs sai.
-- Os aparelhos guardam as equipes de porte apagadas até relerem tudo: depois de rodar, peça a quem usa o app para
-- tocar em "Reler agora" (Painel).
-- Depois de rodar: npx supabase migration repair --status reverted 0017

begin;

-- 1. Funções.
create or replace function public.crew_signature(p_type uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(c.job_role_id::text || ':' || c.quantity, ',' order by c.job_role_id), '')
  from public.service_type_crew c where c.service_type_id = p_type and c.archived_at is null
$$;

create or replace function public.create_event_slots(p_event uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  c record;
  n int := 0;
begin
  select * into e from public.events where id = p_event;
  if e.status = 'cancelled' or e.ignored or e.no_team or e.service_type_id is null then
    return 0;
  end if;
  for c in
    select sc.job_role_id, sc.quantity
    from public.service_type_crew sc
    join public.service_types t on t.id = sc.service_type_id
    join public.job_roles r on r.id = sc.job_role_id
    where sc.service_type_id = e.service_type_id and sc.archived_at is null
      and t.archived_at is null and not t.no_team and r.archived_at is null
    order by r.code
  loop
    for i in 1 .. c.quantity loop
      perform public.new_slot(p_event, c.job_role_id, false);
      n := n + 1;
    end loop;
  end loop;
  return n;
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
  v_complex boolean := coalesce((pl ->> 'complex')::boolean, false);
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

  insert into public.service_types (id, name, keywords, no_team, icon, complex)
  values (
    v_id, v_name,
    array(select distinct btrim(k) from jsonb_array_elements_text(coalesce(pl -> 'keywords', '[]')) k where btrim(k) <> ''),
    v_no_team, v_icon, v_complex
  )
  on conflict (id) do update set
    name = excluded.name, keywords = excluded.keywords, no_team = excluded.no_team,
    -- Pedido sem a chave (aparelho com a versão anterior) mantém o valor gravado.
    icon = case when pl ? 'icon' then excluded.icon else public.service_types.icon end,
    complex = case when pl ? 'complex' then excluded.complex else public.service_types.complex end
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

create or replace function public.op_event_update_extras(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_type_changed boolean;
  v_team_changed boolean;
  v_built boolean;
  v_people boolean;
  v_mode text := pl ->> 'mode';
  v_version int;
begin
  select * into e from public.events where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Evento não encontrado.');
  end if;
  perform public.check_base(p_base, e.version, to_jsonb(e), pl);
  if e.status = 'cancelled' then
    perform public.fail('event_cancelled', 'Evento cancelado: os dados extras ficam só para leitura.');
  end if;
  perform public.assert_week_open(e.week_start);
  if char_length(coalesce(pl ->> 'notes', '')) > 2000 then
    perform public.fail('notes_too_long', 'A observação vai até 2.000 caracteres.');
  end if;
  v_type_changed := pl ? 'service_type_id' and (pl ->> 'service_type_id')::uuid is distinct from e.service_type_id;
  v_team_changed := pl ? 'no_team' and (pl ->> 'no_team')::boolean is distinct from e.no_team;
  v_built := exists (select 1 from public.weeks w where w.week_start = e.week_start);
  v_people := public.event_has_people(e.id);
  if (v_type_changed or v_team_changed) and v_built and v_people and v_mode is null then
    perform public.fail('mode_required', 'O evento já tem pessoas escaladas: escolha manter as vagas ou refazê-las.');
  end if;

  update public.events set
    service_type_id = case when pl ? 'service_type_id' then (pl ->> 'service_type_id')::uuid else service_type_id end,
    type_certainty = case when v_type_changed then case when pl ->> 'service_type_id' is null then 'baixa' else 'alta' end else type_certainty end,
    type_source = case when v_type_changed then 'admin' else type_source end,
    no_team = case when pl ? 'no_team' then (pl ->> 'no_team')::boolean else no_team end,
    notes = case when pl ? 'notes' then pl ->> 'notes' else notes end,
    period_start = case when pl ? 'period_start' then (pl ->> 'period_start')::timestamptz else period_start end,
    period_end = case when pl ? 'period_end' then (pl ->> 'period_end')::timestamptz else period_end end,
    highlighted = case when pl ? 'highlighted' then coalesce((pl ->> 'highlighted')::boolean, false) else highlighted end
  where id = e.id
  returning version into v_version;

  if (v_type_changed or v_team_changed) and v_built and (not v_people or v_mode = 'rebuild') then
    perform public.rebuild_event_slots(e.id);
    select version into v_version from public.events where id = e.id;
  end if;
  if v_built then
    perform public.mark_week_dirty(e.week_start);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- 2. Equipes. Tipos que ganharam porte (pela 0017 ou pela tela) ficam só com a equipe do Médio; os da cópia
-- voltam exatamente ao que eram.
create temporary table _sized_0017 on commit drop as
select id from public.service_types where sized
union select ref from public._backup_0017 where kind = 'crew';

delete from public.service_type_crew where size <> 2;

update public.service_type_crew c set archived_at = now()
where c.archived_at is null and c.service_type_id in (select ref from public._backup_0017 where kind = 'crew');

update public.service_type_crew c
set archived_at = null, quantity = (b.data ->> 'quantity')::int
from public._backup_0017 b
where b.kind = 'crew' and c.id = (b.data ->> 'id')::uuid;

-- 3. Colunas.
alter table public.service_type_crew drop constraint service_type_crew_type_size_role_key;
alter table public.service_type_crew drop column size;
alter table public.service_type_crew add constraint service_type_crew_service_type_id_job_role_id_key unique (service_type_id, job_role_id);
alter table public.events drop column size;
alter table public.service_types drop column sized, drop column default_size;
drop function public.event_crew_size(smallint, boolean, smallint);

-- 4. Vagas dos eventos desses tipos sem ninguém, pela equipe antiga; o aviso posto pela 0017 sai.
do $$
declare ev record;
begin
  for ev in
    select e.id, e.week_start from public.events e
    where e.service_type_id in (select id from _sized_0017)
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
from public._backup_0017 b
where b.kind = 'event_outdated' and e.id = b.ref;

-- A cópia fica até alguém conferir; apague à mão depois: drop table public._backup_0017;

commit;
