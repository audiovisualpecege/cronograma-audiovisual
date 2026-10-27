-- Vagas e porte aprendidos pela série (1.1.0). Pedido do Raoni em 27/10/2026: qualquer evento pode ganhar ou perder
-- vagas, e a mudança vira o padrão da série (mesmo título, public.event_series), para a semana seguinte já vir
-- certa; o porte da série também é aplicado sozinho.
--   - series_rules.crew (e crew_type_id): as vagas do último evento da série em que alguém pôs ou tirou uma vaga
--     (slot.add, slot.remove), valendo enquanto a série tiver o mesmo tipo;
--   - series_rules.size: o porte da última troca de porte num evento da série (a troca de porte esquece as vagas
--     aprendidas: o porte escolhido manda);
--   - as vagas nascem pela série: as aprendidas, senão a equipe do porte (o do evento, senão o da série, senão o
--     padrão do tipo);
--   - week.build recebe "sizes" (porte de cada evento sem porte e ainda sem vagas, sugerido pelo app a partir do
--     histórico da série) e grava antes de criar as vagas.
-- Não mexe em dados.

alter table public.series_rules
  add column crew jsonb,
  add column crew_type_id uuid references public.service_types (id),
  add column size smallint check (size is null or size between 1 and 3);

-- As vagas ativas do evento viram as da série, para o tipo dele.
create function public.learn_series_crew(p_event uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_series text;
  v_crew jsonb;
begin
  select * into e from public.events where id = p_event;
  v_series := public.event_series(e.title);
  if e.service_type_id is null or v_series = '' then
    return;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('job_role_id', x.job_role_id, 'quantity', x.n) order by x.job_role_id), '[]')
  into v_crew
  from (
    select s.job_role_id, count(*) as n from public.slots s
    where s.event_id = p_event and s.archived_at is null
    group by s.job_role_id
  ) x;
  insert into public.series_rules (series, crew, crew_type_id) values (v_series, v_crew, e.service_type_id)
  on conflict (series) do update set crew = excluded.crew, crew_type_id = excluded.crew_type_id
  where public.series_rules.crew is distinct from excluded.crew or public.series_rules.crew_type_id is distinct from excluded.crew_type_id;
end;
$$;

-- O porte escolhido no evento vira o da série e esquece as vagas aprendidas.
create function public.learn_series_size(p_event uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_series text;
begin
  select * into e from public.events where id = p_event;
  v_series := public.event_series(e.title);
  if e.size is null or v_series = '' then
    return;
  end if;
  insert into public.series_rules (series, size) values (v_series, e.size)
  on conflict (series) do update set size = excluded.size, crew = null, crew_type_id = null
  where public.series_rules.size is distinct from excluded.size or public.series_rules.crew is not null;
end;
$$;

-- Vagas do evento: as aprendidas pela série (mesmo tipo), senão a equipe do porte (o do evento, senão o da série,
-- senão o padrão do tipo); nada para evento cancelado, ignorado, sem tipo ou que não exige equipe.
create or replace function public.create_event_slots(p_event uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  r public.series_rules;
  c record;
  n int := 0;
begin
  select * into e from public.events where id = p_event;
  if e.status = 'cancelled' or e.ignored or e.no_team or e.service_type_id is null then
    return 0;
  end if;
  if exists (select 1 from public.service_types t where t.id = e.service_type_id and (t.no_team or t.archived_at is not null)) then
    return 0;
  end if;
  select * into r from public.series_rules where series = public.event_series(e.title);

  if r.crew is not null and r.crew_type_id = e.service_type_id then
    for c in
      select jr.id as job_role_id, (x ->> 'quantity')::int as quantity
      from jsonb_array_elements(r.crew) x
      join public.job_roles jr on jr.id = (x ->> 'job_role_id')::uuid and jr.archived_at is null
      order by jr.code
    loop
      for i in 1 .. c.quantity loop
        perform public.new_slot(p_event, c.job_role_id, false);
        n := n + 1;
      end loop;
    end loop;
    return n;
  end if;

  for c in
    select sc.job_role_id, sc.quantity
    from public.service_type_crew sc
    join public.service_types t on t.id = sc.service_type_id
    join public.job_roles jr on jr.id = sc.job_role_id
    where sc.service_type_id = e.service_type_id and sc.archived_at is null
      and sc.size = public.event_crew_size(coalesce(e.size, r.size), t.sized, t.default_size)
      and jr.archived_at is null
    order by jr.code
  loop
    for i in 1 .. c.quantity loop
      perform public.new_slot(p_event, c.job_role_id, false);
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

-- Igual à 0004, mais: a vaga a mais ensina a série. Sem versão de base (a grade não manda), não há conflito.
create or replace function public.op_slot_add(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  r public.job_roles;
  v_slot uuid;
begin
  select * into e from public.events where id = (pl ->> 'event_id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Evento não encontrado.');
  end if;
  perform public.check_base(p_base, e.version, to_jsonb(e), pl);
  if e.status = 'cancelled' then
    perform public.fail('event_cancelled', 'Evento cancelado não aceita alocações.');
  end if;
  perform public.assert_week_open(e.week_start);
  select * into r from public.job_roles where id = (pl ->> 'job_role_id')::uuid;
  if not found then
    perform public.fail('not_found', 'Função não encontrada.');
  end if;
  if r.archived_at is not null then
    perform public.fail('role_archived', 'Função arquivada: escolha outra.');
  end if;
  v_slot := public.new_slot(e.id, r.id, true, (pl ->> 'id')::uuid);
  perform public.learn_series_crew(e.id);
  perform public.mark_week_dirty(e.week_start);
  return jsonb_build_object('status', 'applied', 'version', 1, 'id', v_slot);
end;
$$;

-- Igual à 0004, mais: tirar a vaga ensina a série. Vaga com gente sai do mesmo jeito (a pessoa é liberada).
create or replace function public.op_slot_remove(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.slots;
  v_ws date;
  v_version int;
begin
  select * into s from public.slots where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Vaga não encontrada.');
  end if;
  perform public.check_base(p_base, s.version, to_jsonb(s), pl);
  select week_start into v_ws from public.events where id = s.event_id;
  perform public.assert_week_open(v_ws);
  if s.archived_at is not null then
    return jsonb_build_object('status', 'applied', 'version', s.version);
  end if;
  perform public.open_slot(s.id);
  update public.slots set archived_at = now() where id = s.id returning version into v_version;
  perform public.learn_series_crew(s.event_id);
  perform public.mark_week_dirty(v_ws);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- Montar semana com o porte sugerido: "sizes" ({id do evento: 1 a 3}) vale para evento da semana sem porte e
-- ainda sem vagas, antes de criar as vagas.
create or replace function public.op_week_build(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  w public.weeks;
  ws date := public.monday_of((pl ->> 'week_start')::date);
  v_res jsonb;
begin
  select * into w from public.weeks where week_start = ws;
  if found then
    perform public.check_base(p_base, w.version, to_jsonb(w), pl);
  end if;
  if jsonb_typeof(pl -> 'sizes') = 'object' then
    update public.events e set size = (x.value #>> '{}')::smallint
    from jsonb_each(pl -> 'sizes') x
    where e.id = x.key::uuid and e.week_start = ws and e.size is null
      and (x.value #>> '{}') ~ '^[1-3]$'
      and not exists (select 1 from public.slots s where s.event_id = e.id and s.archived_at is null);
  end if;
  v_res := public.build_week_internal(ws);
  select * into w from public.weeks where id = (v_res ->> 'week_id')::uuid;
  return jsonb_build_object('status', 'applied', 'version', w.version) || v_res;
end;
$$;

-- Dados extras do evento. Igual à 0020, mais: a troca de porte ensina a série.
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

  -- O porte primeiro: as vagas refeitas abaixo já seguem o porte novo, e não as vagas aprendidas antes.
  if v_size_changed and pl ->> 'size' is not null then
    perform public.learn_series_size(e.id);
  end if;
  if (v_type_changed or v_team_changed or v_size_changed) and v_built and (not v_people or v_mode = 'rebuild') then
    perform public.rebuild_event_slots(e.id);
    select version into v_version from public.events where id = e.id;
  end if;
  if v_built then
    perform public.mark_week_dirty(e.week_start);
  end if;
  if v_type_changed and pl ->> 'service_type_id' is not null then
    perform public.learn_series_type(e.id);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;
