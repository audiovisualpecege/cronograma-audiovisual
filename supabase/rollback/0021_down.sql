-- Desfaz a migração 0021_series_crew.sql. Ver docs/publicar-1.1.0.md. Rode antes do 0020_down.sql.
-- As funções voltam ao que eram (create_event_slots da 0017, op_slot_add, op_slot_remove e op_week_build da
-- 0004, op_event_update_extras da 0020) e saem as colunas de vagas e porte aprendidos. As vagas já criadas e os
-- portes já gravados nos eventos ficam como estão.
-- Depois de rodar: npx supabase migration repair --status reverted 0021

begin;

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
  perform public.mark_week_dirty(e.week_start);
  return jsonb_build_object('status', 'applied', 'version', 1, 'id', v_slot);
end;
$$;

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
  perform public.mark_week_dirty(v_ws);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create or replace function public.op_week_build(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  w public.weeks;
  v_res jsonb;
begin
  select * into w from public.weeks where week_start = public.monday_of((pl ->> 'week_start')::date);
  if found then
    perform public.check_base(p_base, w.version, to_jsonb(w), pl);
  end if;
  v_res := public.build_week_internal((pl ->> 'week_start')::date);
  select * into w from public.weeks where id = (v_res ->> 'week_id')::uuid;
  return jsonb_build_object('status', 'applied', 'version', w.version) || v_res;
end;
$$;

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
  if v_type_changed and pl ->> 'service_type_id' is not null then
    perform public.learn_series_type(e.id);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

drop function public.learn_series_size(uuid);
drop function public.learn_series_crew(uuid);
alter table public.series_rules drop column size, drop column crew_type_id, drop column crew;

commit;
