-- Gatilhos: versão e updated_at (cursor da leitura incremental), semana do evento, último administrador e
-- recálculo dos alertas das alocações quando ausência, horário do evento ou função arquivada mudam.

create function public.tg_row_meta() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'sectors', 'job_roles', 'people', 'person_roles', 'service_types', 'service_type_crew', 'absences',
    'calendar_sources', 'weeks', 'events', 'slots', 'assignments', 'published_assignments', 'publications',
    'history_imports', 'history_entries', 'notifications', 'push_subscriptions', 'jobs', 'settings'
  ] loop
    execute format('create trigger row_meta before insert or update on public.%I for each row execute function public.tg_row_meta()', t);
  end loop;
end;
$$;

-- A semana do evento sai sempre do início, em Brasília.
create function public.tg_event_week() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.week_start := public.week_start_of(new.starts_at);
  return new;
end;
$$;

create trigger event_week before insert or update of starts_at on public.events
  for each row execute function public.tg_event_week();

-- Nunca fica sem administrador ativo (US-002 EC-10, US-003 EC-2).
create function public.tg_last_admin() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.profile = 'admin' and old.active and not (new.profile = 'admin' and new.active) then
    perform pg_advisory_xact_lock(hashtext('public.people.last_admin'));
    if not exists (
      select 1 from public.people p where p.id <> new.id and p.profile = 'admin' and p.active
    ) then
      perform public.fail('last_admin', 'Precisa haver pelo menos um administrador ativo.');
    end if;
  end if;
  return new;
end;
$$;

create trigger last_admin before update of profile, active on public.people
  for each row execute function public.tg_last_admin();

-- ---------------------------------------------------------------------------------------------
-- Recálculo dos alertas guardados em assignments.warnings. Um alerta novo põe o evento nas pendências
-- (review_pending), como pedem US-006 AC-3 e US-011 AC-5.

create function public.recompute_warnings(p_ids uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  w text[];
begin
  for a in
    select x.id, x.person_id, x.slot_id, x.event_id, x.warnings, r.archived_at is not null as role_archived
    from public.assignments x
    join public.slots s on s.id = x.slot_id
    join public.job_roles r on r.id = s.job_role_id
    join public.events e on e.id = x.event_id
    where x.id = any (p_ids) and s.archived_at is null and not public.is_week_past(e.week_start)
  loop
    w := '{}';
    if a.person_id is not null then
      select coalesce(array_agg(v), '{}') into w
      from jsonb_array_elements_text(public.check_eligibility(a.person_id, a.slot_id) -> 'warnings') v;
    end if;
    if a.role_archived then
      w := w || 'role_archived'::text;
    end if;
    if w is distinct from a.warnings then
      update public.assignments set warnings = w where id = a.id;
      if exists (select unnest(w) except select unnest(a.warnings)) then
        update public.events set review_pending = true where id = a.event_id and not review_pending;
      end if;
    end if;
  end loop;
end;
$$;

-- Alocações de uma pessoa em semanas não arquivadas.
create function public.person_assignment_ids(p_person uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(a.id), '{}')
  from public.assignments a join public.events e on e.id = a.event_id
  where a.person_id = p_person and not public.is_week_past(e.week_start)
$$;

create function public.tg_absence_warnings() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.recompute_warnings(public.person_assignment_ids(new.person_id));
  if tg_op = 'UPDATE' and old.person_id <> new.person_id then
    perform public.recompute_warnings(public.person_assignment_ids(old.person_id));
  end if;
  return null;
end;
$$;

create trigger absence_warnings after insert or update on public.absences
  for each row execute function public.tg_absence_warnings();

-- Horário ou situação do evento mudou (agenda ou evento interno): revê todas as alocações de quem está nele,
-- porque a sobreposição e a carga envolvem os outros eventos da pessoa.
create function public.tg_event_warnings() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare ids uuid[];
begin
  select coalesce(array_agg(distinct x), '{}') into ids
  from (
    select unnest(public.person_assignment_ids(a.person_id)) x
    from public.assignments a where a.event_id = new.id and a.person_id is not null
  ) s;
  perform public.recompute_warnings(ids);
  return null;
end;
$$;

create trigger event_warnings after update on public.events
  for each row
  when (
    old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at
    or old.all_day is distinct from new.all_day or old.period_start is distinct from new.period_start
    or old.period_end is distinct from new.period_end or old.status is distinct from new.status
  )
  execute function public.tg_event_warnings();

-- Função arquivada ou reativada: vagas futuras dela ganham ou perdem o alerta role_archived (US-004 EC-3).
create function public.tg_role_warnings() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.recompute_warnings(array(
    select a.id from public.assignments a join public.slots s on s.id = a.slot_id
    where s.job_role_id = new.id and s.archived_at is null
  ));
  return null;
end;
$$;

create trigger role_warnings after update of archived_at on public.job_roles
  for each row when (old.archived_at is distinct from new.archived_at)
  execute function public.tg_role_warnings();
