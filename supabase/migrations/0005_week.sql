-- Aptidão em SQL (espelho de checkEligibility do core), vagas dos eventos e montagem da semana.

-- Mesma resposta que checkEligibility (packages/core/src/scheduling.ts): bloqueios impedem a gravação,
-- alertas pedem "escalar mesmo assim". A ordem dos itens é a mesma do core.
create function public.check_eligibility(p_person uuid, p_slot uuid) returns jsonb
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

-- ---------------------------------------------------------------------------------------------
-- Vagas

-- Semana publicada passa a ter alterações não publicadas desde agora (ADR-004, ADR-011).
create function public.mark_week_dirty(ws date) returns void
language sql security definer set search_path = ''
as $$
  update public.weeks set dirty_since = now()
  where week_start = ws and state = 'published' and dirty_since is null
$$;

-- Vaga aberta: sem pessoa, sem trava, sem justificativa; só fica o alerta de função arquivada.
create function public.open_slot(p_slot uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.assignments a
  set person_id = null, status = null, locked = false, override = false, reason = null,
      decided_by = public.current_person(), decided_at = now(),
      warnings = case when exists (
        select 1 from public.slots s join public.job_roles r on r.id = s.job_role_id
        where s.id = a.slot_id and r.archived_at is not null
      ) then array['role_archived'] else '{}'::text[] end
  where a.slot_id = p_slot
$$;

create function public.new_slot(p_event uuid, p_role uuid, p_extra boolean, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare sid uuid;
begin
  insert into public.slots (id, event_id, job_role_id, extra)
  values (coalesce(p_id, gen_random_uuid()), p_event, p_role, p_extra)
  returning id into sid;
  insert into public.assignments (slot_id, event_id) values (sid, p_event);
  return sid;
end;
$$;

-- Equipe típica do tipo do evento; nada para evento cancelado, ignorado, sem tipo ou que não exige equipe.
create function public.create_event_slots(p_event uuid) returns int
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

-- Arquiva as vagas atuais do evento (liberando quem estava nelas) e cria as do tipo de novo.
create function public.rebuild_event_slots(p_event uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  for s in select id from public.slots where event_id = p_event and archived_at is null loop
    perform public.open_slot(s.id);
    update public.slots set archived_at = now() where id = s.id;
  end loop;
  update public.events set crew_outdated = false where id = p_event and crew_outdated;
  return public.create_event_slots(p_event);
end;
$$;

-- Evento com alguém escalado (proposta ou confirmada) em vaga ativa.
create function public.event_has_people(p_event uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a join public.slots s on s.id = a.slot_id
    where a.event_id = p_event and a.person_id is not null and s.archived_at is null
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- Montar semana (US-010 AC-4): cria a semana em montagem e as vagas de cada evento com tipo.

create function public.build_week_internal(p_ws date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  ws date := public.monday_of(p_ws);
  wid uuid;
  n int := 0;
  ev record;
begin
  if public.is_week_past(ws) then
    perform public.fail('week_past', 'Semana passada fica só para consulta; não pode ser montada.');
  end if;
  select id into wid from public.weeks where week_start = ws;
  if found then
    return jsonb_build_object('week_id', wid, 'slots_created', 0, 'existing', true);
  end if;
  if not exists (
    select 1 from public.events e where e.week_start = ws and e.status <> 'cancelled' and not e.ignored
  ) then
    perform public.fail('no_events', 'Nenhum evento nesta semana.');
  end if;

  insert into public.weeks (week_start) values (ws)
  on conflict (week_start) do nothing
  returning id into wid;
  if wid is null then
    select id into wid from public.weeks where week_start = ws;
    return jsonb_build_object('week_id', wid, 'slots_created', 0, 'existing', true);
  end if;

  for ev in
    select e.id from public.events e
    where e.week_start = ws and e.status <> 'cancelled' and not e.ignored
      and not exists (select 1 from public.slots s where s.event_id = e.id and s.archived_at is null)
    order by e.starts_at, e.id
  loop
    n := n + public.create_event_slots(ev.id);
  end loop;
  return jsonb_build_object('week_id', wid, 'slots_created', n, 'existing', false);
end;
$$;

create function public.build_week(week_start date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    perform public.fail('forbidden', 'Só administradores montam a semana.');
  end if;
  return public.build_week_internal(build_week.week_start);
end;
$$;
