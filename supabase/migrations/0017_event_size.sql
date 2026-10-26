-- Porte do evento (1.1.0). No histórico de out/2025 a out/2026, metade dos EVENTOS teve 1 pessoa e só 7% teve 6
-- ou mais, mas o tipo pedia 8 vagas em todos; GRAVACAO e PODCAST variam do mesmo jeito. Agora:
--   - service_types.sized: o tipo tem porte (Simples, Médio, Grande), com uma equipe típica para cada um;
--   - service_type_crew.size: 1 Simples, 2 Médio, 3 Grande. Tipo sem porte tem uma equipe só, guardada como 2;
--   - service_types.default_size: o porte de quem não escolheu (o histórico mostra EVENTO quase sempre Simples e
--     GRAVACAO quase sempre Médio);
--   - events.size: o porte escolhido no evento. Vazio vale o padrão do tipo; o app sugere o porte pela série do
--     evento no histórico e quem monta a escala troca com um clique;
--   - service_type.upsert recebe "sized", "default_size" e o "size" de cada item da equipe; event.update_extras
--     recebe "size" e refaz as vagas como numa troca de tipo (com gente escalada, pede manter ou refazer).
-- Dados: EVENTO (padrão Simples), GRAVACAO e PODCAST (padrão Médio) ganham porte, com a equipe combinada com o
-- Raoni em 26/10/2026, e a TRANSMISSAO deixa de pedir Suporte (ninguém tem a função; a vaga ficava sempre vazia).
-- Tudo o que muda fica antes em public._backup_0017, para supabase/rollback/0017_down.sql.

alter table public.service_types
  add column sized boolean not null default false,
  add column default_size smallint not null default 1 check (default_size between 1 and 3);

alter table public.service_type_crew add column size smallint not null default 2 check (size between 1 and 3);
alter table public.service_type_crew drop constraint service_type_crew_service_type_id_job_role_id_key;
alter table public.service_type_crew add constraint service_type_crew_type_size_role_key unique (service_type_id, size, job_role_id);

alter table public.events add column size smallint check (size is null or size between 1 and 3);

-- Porte que vale para o evento: o escolhido; sem escolha, o padrão do tipo. Tipo sem porte usa a equipe única (2).
-- Espelha effectiveSize do core.
create function public.event_crew_size(p_size smallint, p_sized boolean, p_default smallint) returns smallint
language sql immutable set search_path = ''
as $$ select case when p_sized then coalesce(p_size, p_default, 1::smallint) else 2::smallint end $$;

create or replace function public.crew_signature(p_type uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(c.size || ':' || c.job_role_id::text || ':' || c.quantity, ',' order by c.size, c.job_role_id), '')
    || case when t.sized then ':sized:' || t.default_size else '' end
  from public.service_types t
  left join public.service_type_crew c on c.service_type_id = t.id and c.archived_at is null
  where t.id = p_type
  group by t.sized, t.default_size
$$;

-- Equipe típica do tipo do evento, no porte do evento (sem porte escolhido, o padrão do tipo); nada para evento
-- cancelado, ignorado, sem tipo ou que não exige equipe.
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
      and sc.size = public.event_crew_size(e.size, t.sized, t.default_size)
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
  v_sized boolean;
  v_keep_crew boolean := false;
  v_existed boolean;
  v_before text;
  v_before_no_team boolean;
  v_before_sized boolean;
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
  if exists (select 1 from public.service_types t where public.norm_name(t.name) = public.norm_name(v_name) and t.id <> v_id) then
    perform public.fail('name_taken', 'Já existe um tipo de serviço com este nome.');
  end if;
  if v_icon is not null and v_icon !~ '^[a-z0-9-]{1,40}$' then
    perform public.fail('invalid_icon', 'Ícone inválido.');
  end if;
  if pl ? 'default_size' and coalesce(pl ->> 'default_size', '') !~ '^[1-3]$' then
    perform public.fail('invalid_size', 'O porte vai de 1 (Simples) a 3 (Grande).');
  end if;

  select true, public.crew_signature(t.id), t.no_team, t.sized into v_existed, v_before, v_before_no_team, v_before_sized
  from public.service_types t where t.id = v_id;

  -- Aparelho com a versão anterior (sem "sized") num tipo com porte: mantém o porte e as equipes gravadas.
  v_sized := case when pl ? 'sized' then coalesce((pl ->> 'sized')::boolean, false) else coalesce(v_before_sized, false) end;
  v_keep_crew := not pl ? 'sized' and coalesce(v_before_sized, false);
  if not v_keep_crew then
    -- Sem porte, a equipe única fica no 2; com porte, cada item diz o seu (sem dizer, Médio).
    v_crew := coalesce((
      select jsonb_agg(c || jsonb_build_object('size', case when v_sized then coalesce((c ->> 'size')::int, 2) else 2 end))
      from jsonb_array_elements(v_crew) c
    ), '[]');
    if exists (select 1 from jsonb_array_elements(v_crew) c where (c ->> 'size')::int not between 1 and 3) then
      perform public.fail('invalid_size', 'O porte vai de 1 (Simples) a 3 (Grande).');
    end if;
    if jsonb_array_length(v_crew) = 0 and not v_no_team then
      perform public.fail('type_without_crew', 'Escolha ao menos uma função ou marque "não exige equipe".');
    end if;
    if v_sized and not v_no_team and exists (
      select 1 from generate_series(1, 3) s
      where not exists (select 1 from jsonb_array_elements(v_crew) c where (c ->> 'size')::int = s)
    ) then
      perform public.fail('size_without_crew', 'Cada porte (Simples, Médio e Grande) precisa de ao menos uma função.');
    end if;
  end if;

  insert into public.service_types (id, name, keywords, no_team, icon, complex, sized, default_size)
  values (
    v_id, v_name,
    array(select distinct btrim(k) from jsonb_array_elements_text(coalesce(pl -> 'keywords', '[]')) k where btrim(k) <> ''),
    v_no_team, v_icon, v_complex, v_sized, coalesce((pl ->> 'default_size')::smallint, 1)
  )
  on conflict (id) do update set
    name = excluded.name, keywords = excluded.keywords, no_team = excluded.no_team, sized = excluded.sized,
    default_size = case when pl ? 'default_size' then excluded.default_size else public.service_types.default_size end,
    -- Pedido sem a chave (aparelho com a versão anterior) mantém o valor gravado.
    icon = case when pl ? 'icon' then excluded.icon else public.service_types.icon end,
    complex = case when pl ? 'complex' then excluded.complex else public.service_types.complex end
  returning version into v_version;

  if not v_keep_crew then
    insert into public.service_type_crew (service_type_id, job_role_id, size, quantity)
    select v_id, (c ->> 'job_role_id')::uuid, (c ->> 'size')::smallint, (c ->> 'quantity')::int from jsonb_array_elements(v_crew) c
    on conflict (service_type_id, size, job_role_id) do update set quantity = excluded.quantity, archived_at = null
    where public.service_type_crew.quantity <> excluded.quantity or public.service_type_crew.archived_at is not null;
    update public.service_type_crew x set archived_at = now()
    where x.service_type_id = v_id and x.archived_at is null
      and not exists (
        select 1 from jsonb_array_elements(v_crew) c
        where (c ->> 'job_role_id')::uuid = x.job_role_id and (c ->> 'size')::smallint = x.size
      );
  end if;

  if v_existed and (v_before is distinct from public.crew_signature(v_id) or v_before_no_team <> v_no_team) then
    perform public.apply_crew_change(v_id);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

-- Dados extras do evento, agora com o porte. Igual à 0013, mais a chave "size" (nulo volta ao padrão).
create or replace function public.op_event_update_extras(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_type_changed boolean;
  v_team_changed boolean;
  v_size_changed boolean;
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
  if pl ? 'size' and pl ->> 'size' is not null and (pl ->> 'size') !~ '^[1-3]$' then
    perform public.fail('invalid_size', 'O porte vai de 1 (Simples) a 3 (Grande).');
  end if;
  v_type_changed := pl ? 'service_type_id' and (pl ->> 'service_type_id')::uuid is distinct from e.service_type_id;
  v_team_changed := pl ? 'no_team' and (pl ->> 'no_team')::boolean is distinct from e.no_team;
  v_size_changed := pl ? 'size' and (pl ->> 'size')::smallint is distinct from e.size;
  v_built := exists (select 1 from public.weeks w where w.week_start = e.week_start);
  v_people := public.event_has_people(e.id);
  if (v_type_changed or v_team_changed or v_size_changed) and v_built and v_people and v_mode is null then
    perform public.fail('mode_required', 'O evento já tem pessoas escaladas: escolha manter as vagas ou refazê-las.');
  end if;

  update public.events set
    service_type_id = case when pl ? 'service_type_id' then (pl ->> 'service_type_id')::uuid else service_type_id end,
    type_certainty = case when v_type_changed then case when pl ->> 'service_type_id' is null then 'baixa' else 'alta' end else type_certainty end,
    type_source = case when v_type_changed then 'admin' else type_source end,
    no_team = case when pl ? 'no_team' then (pl ->> 'no_team')::boolean else no_team end,
    size = case when pl ? 'size' then (pl ->> 'size')::smallint else size end,
    notes = case when pl ? 'notes' then pl ->> 'notes' else notes end,
    period_start = case when pl ? 'period_start' then (pl ->> 'period_start')::timestamptz else period_start end,
    period_end = case when pl ? 'period_end' then (pl ->> 'period_end')::timestamptz else period_end end,
    highlighted = case when pl ? 'highlighted' then coalesce((pl ->> 'highlighted')::boolean, false) else highlighted end
  where id = e.id
  returning version into v_version;

  if (v_type_changed or v_team_changed or v_size_changed) and v_built and (not v_people or v_mode = 'rebuild') then
    perform public.rebuild_event_slots(e.id);
    select version into v_version from public.events where id = e.id;
  end if;
  if v_built then
    perform public.mark_week_dirty(e.week_start);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Dados. A cópia (public._backup_0017) fica fechada pela RLS, sem política: ninguém lê pela API.

create table public._backup_0017 (
  kind text not null,  -- crew | event_outdated
  ref uuid not null,
  data jsonb,
  saved_at timestamptz not null default now()
);
alter table public._backup_0017 enable row level security;
revoke all on public._backup_0017 from anon, authenticated;

insert into public._backup_0017 (kind, ref, data)
select 'crew', c.service_type_id, to_jsonb(c) from public.service_type_crew c
join public.service_types t on t.id = c.service_type_id
where public.norm_name(t.name) in ('evento', 'gravacao', 'podcast', 'transmissao') and c.archived_at is null;

-- Equipe por porte (tipo, porte, função, quantidade; tipo e função pelo norm_name). Função que não existe fica de
-- fora; o tipo só ganha porte se os três portes ficarem com alguém.
do $$
declare
  v_type record;
  v_size int;
  v_n int;
begin
  create temporary table _crew_0017 (type_name text, size int, role_name text, quantity int) on commit drop;
  insert into _crew_0017 values
    ('evento', 1, 'operador evento', 1),
    ('evento', 2, 'operador evento', 1), ('evento', 2, 'cinegrafista', 1), ('evento', 2, 'fotografia', 1),
    ('evento', 3, 'operador auditorio', 1), ('evento', 3, 'operador evento', 1), ('evento', 3, 'cinegrafista', 2),
    ('evento', 3, 'fotografia', 2), ('evento', 3, 'producao', 2),
    ('gravacao', 1, 'cinegrafista', 1),
    ('gravacao', 2, 'cinegrafista', 1), ('gravacao', 2, 'producao', 1),
    ('gravacao', 3, 'cinegrafista', 2), ('gravacao', 3, 'producao', 2),
    ('podcast', 1, 'operador evento', 1),
    ('podcast', 2, 'cinegrafista', 1), ('podcast', 2, 'operador evento', 1), ('podcast', 2, 'producao', 1),
    ('podcast', 3, 'cinegrafista', 2), ('podcast', 3, 'operador evento', 1), ('podcast', 3, 'producao', 1);

  for v_type in
    select t.id, public.norm_name(t.name) as name from public.service_types t
    where public.norm_name(t.name) in ('evento', 'gravacao', 'podcast') and t.archived_at is null and not t.no_team
  loop
    select count(distinct w.size) into v_n
    from _crew_0017 w join public.job_roles r on public.norm_name(r.name) = w.role_name and r.archived_at is null
    where w.type_name = v_type.name;
    if v_n < 3 then
      continue;
    end if;
    insert into public._backup_0017 (kind, ref)
    select 'event_outdated', e.id from public.events e
    where e.service_type_id = v_type.id and not e.crew_outdated and public.event_has_people(e.id)
      and e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start) and exists (select 1 from public.weeks w where w.week_start = e.week_start);
    update public.service_type_crew set archived_at = now() where service_type_id = v_type.id and archived_at is null;
    for v_size in 1 .. 3 loop
      insert into public.service_type_crew (service_type_id, job_role_id, size, quantity)
      select v_type.id, r.id, w.size, w.quantity
      from _crew_0017 w join public.job_roles r on public.norm_name(r.name) = w.role_name and r.archived_at is null
      where w.type_name = v_type.name and w.size = v_size
      on conflict (service_type_id, size, job_role_id) do update set quantity = excluded.quantity, archived_at = null;
    end loop;
    update public.service_types set sized = true, default_size = case when v_type.name = 'evento' then 1 else 2 end where id = v_type.id;
    perform public.apply_crew_change(v_type.id);
  end loop;
end;
$$;

-- TRANSMISSAO sem a vaga de Suporte, quando sobra outra função na equipe.
do $$
declare t uuid;
begin
  for t in
    select x.id from public.service_types x
    where public.norm_name(x.name) = 'transmissao' and x.archived_at is null
      and exists (
        select 1 from public.service_type_crew c join public.job_roles r on r.id = c.job_role_id
        where c.service_type_id = x.id and c.archived_at is null and public.norm_name(r.name) = 'suporte'
      )
      and exists (
        select 1 from public.service_type_crew c join public.job_roles r on r.id = c.job_role_id
        where c.service_type_id = x.id and c.archived_at is null and public.norm_name(r.name) <> 'suporte'
      )
  loop
    insert into public._backup_0017 (kind, ref)
    select 'event_outdated', e.id from public.events e
    where e.service_type_id = t and not e.crew_outdated and public.event_has_people(e.id)
      and e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start) and exists (select 1 from public.weeks w where w.week_start = e.week_start);
    update public.service_type_crew c set archived_at = now()
    from public.job_roles r
    where r.id = c.job_role_id and c.service_type_id = t and c.archived_at is null and public.norm_name(r.name) = 'suporte';
    perform public.apply_crew_change(t);
  end loop;
end;
$$;
