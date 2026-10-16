-- apply_ops (ADR-009): aplica a fila de envio dos aparelhos em ordem, cada operação na sua própria
-- subtransação. Devolve por operação applied, conflict (versão do servidor diferente de baseVersion) ou
-- rejected (regra violada). op_id já aplicado devolve o resultado guardado em applied_ops.
--
-- Os payloads usam os nomes das colunas (snake_case). Escala, vagas, eventos e semana conferem baseVersion;
-- cadastros e configuração vão com baseVersion nulo e a última gravação vale (TechSpec, Core Interfaces).

-- Pedido ao serviço de fundo; pedido igual em andamento devolve o mesmo job.
create function public.enqueue_job(p_kind text, p_payload jsonb, p_dedupe text, p_by uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare jid uuid;
begin
  insert into public.jobs (kind, payload, dedupe_key, requested_by)
  values (p_kind, coalesce(p_payload, '{}'), p_dedupe, p_by)
  on conflict (kind, dedupe_key) where status in ('queued', 'running') and dedupe_key is not null do nothing
  returning id into jid;
  if jid is null then
    select j.id into jid from public.jobs j
    where j.kind = p_kind and j.dedupe_key = p_dedupe and j.status in ('queued', 'running');
  end if;
  return jid;
end;
$$;

-- Conflito: a linha mudou no servidor desde a versão que o aparelho editou (US-026 AC-3).
create function public.check_base(p_base int, p_current int, p_server jsonb, p_local jsonb) returns void
language plpgsql set search_path = ''
as $$
begin
  if p_base is not null and p_base <> p_current then
    raise exception using errcode = 'P0001', message = 'conflict',
      detail = jsonb_build_object('server', p_server, 'local', p_local)::text;
  end if;
end;
$$;

create function public.assert_week_open(ws date) returns void
language plpgsql stable set search_path = ''
as $$
begin
  if public.is_week_past(ws) then
    perform public.fail('week_past', 'Semana passada fica só para consulta.');
  end if;
end;
$$;

create function public.clean_name(s text) returns text
language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(coalesce(s, ''), '\s+', ' ', 'g')) $$;

create function public.blocker_detail(code text) returns text
language sql immutable set search_path = ''
as $$
  select case code
    when 'person_inactive' then 'Pessoa inativa não pode ser escalada.'
    when 'event_cancelled' then 'Evento cancelado não aceita alocações.'
    when 'same_event_twice' then 'Esta pessoa já está neste evento.'
    when 'week_past' then 'Semana passada fica só para consulta.'
    when 'overlap' then 'A pessoa tem outra atividade no mesmo horário.'
    when 'absent' then 'A pessoa está ausente nesse horário.'
    when 'over_limit' then 'A pessoa passaria do limite semanal de horas.'
    when 'role_not_enabled' then 'A pessoa não tem esta função habilitada.'
    else code
  end
$$;

create function public.warning_label(code text) returns text
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

-- ---------------------------------------------------------------------------------------------
-- Pessoas

create function public.op_person_upsert(pl jsonb, me uuid) returns jsonb
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

-- Desativar: perde o acesso, sai das vagas de semanas não arquivadas (viram alterações não publicadas
-- na semana publicada), o feed iCal para e o Auth bane a conta pelo serviço de fundo (US-003).
create function public.op_person_deactivate(pl jsonb, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.people;
  a record;
  v_version int;
begin
  select * into p from public.people where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Pessoa não encontrada.');
  end if;
  if not p.active then
    return jsonb_build_object('status', 'applied', 'version', p.version);
  end if;
  update public.people set active = false, ical_token = null where id = p.id returning version into v_version;
  for a in
    select x.slot_id, e.week_start from public.assignments x join public.events e on e.id = x.event_id
    where x.person_id = p.id and not public.is_week_past(e.week_start)
  loop
    perform public.open_slot(a.slot_id);
    perform public.mark_week_dirty(a.week_start);
  end loop;
  perform public.enqueue_job('auth_ban', jsonb_build_object('person_id', p.id), null, me);
  perform public.enqueue_job('ical_revoke', jsonb_build_object('person_id', p.id, 'token', p.ical_token), null, me);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create function public.op_person_reactivate(pl jsonb, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.people;
  v_version int;
begin
  select * into p from public.people where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Pessoa não encontrada.');
  end if;
  if p.active then
    return jsonb_build_object('status', 'applied', 'version', p.version);
  end if;
  if p.email is null then
    perform public.fail('email_invalid', 'Informe o e-mail antes de reativar.');
  end if;
  update public.people set active = true where id = p.id returning version into v_version;
  perform public.enqueue_job('auth_unban', jsonb_build_object('person_id', p.id), null, me);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Ausências

create function public.op_absence_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_start timestamptz := (pl ->> 'starts_at')::timestamptz;
  v_end timestamptz := (pl ->> 'ends_at')::timestamptz;
  v_version int;
begin
  if v_start is null or v_end is null or v_end <= v_start then
    perform public.fail('end_before_start', 'O fim precisa ser depois do início.');
  end if;
  if char_length(coalesce(pl ->> 'note', '')) > 2000 then
    perform public.fail('notes_too_long', 'A observação vai até 2.000 caracteres.');
  end if;
  insert into public.absences (id, person_id, kind, starts_at, ends_at, all_day, note)
  values (
    v_id, (pl ->> 'person_id')::uuid, coalesce(pl ->> 'kind', 'ausencia'), v_start, v_end,
    coalesce((pl ->> 'all_day')::boolean, false), pl ->> 'note'
  )
  on conflict (id) do update set
    person_id = excluded.person_id, kind = excluded.kind, starts_at = excluded.starts_at,
    ends_at = excluded.ends_at, all_day = excluded.all_day, note = excluded.note
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

create function public.op_absence_archive(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_version int;
begin
  update public.absences set archived_at = coalesce(archived_at, now())
  where id = (pl ->> 'id')::uuid returning version into v_version;
  if v_version is null then
    perform public.fail('not_found', 'Ausência não encontrada.');
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Setores, funções e tipos de serviço

create function public.op_sector_upsert(pl jsonb) returns jsonb
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
  if exists (select 1 from public.sectors s where public.norm_name(s.name) = public.norm_name(v_name) and s.id <> v_id) then
    perform public.fail('name_taken', 'Já existe um setor com este nome.');
  end if;
  insert into public.sectors (id, name) values (v_id, v_name)
  on conflict (id) do update set name = excluded.name
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

create function public.op_job_role_upsert(pl jsonb) returns jsonb
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

-- Arquivar ou reativar um cadastro simples (setor, função).
create function public.op_archive(p_table text, pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_version int;
begin
  execute format(
    'update public.%I set archived_at = case when $2 then coalesce(archived_at, now()) else null end where id = $1 returning version',
    p_table
  ) into v_version using (pl ->> 'id')::uuid, coalesce((pl ->> 'archived')::boolean, true);
  if v_version is null then
    perform public.fail('not_found', 'Cadastro não encontrado.');
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create function public.crew_signature(p_type uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(string_agg(c.job_role_id::text || ':' || c.quantity, ',' order by c.job_role_id), '')
  from public.service_type_crew c where c.service_type_id = p_type and c.archived_at is null
$$;

-- Equipe típica nova vale para eventos de semanas montadas ainda sem ninguém escalado; os escalados
-- mantêm as vagas e ganham o aviso "equipe típica mudou" (US-005 AC-4).
create function public.apply_crew_change(p_type uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare ev record;
begin
  for ev in
    select e.id, e.week_start from public.events e
    where e.service_type_id = p_type and e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start)
      and exists (select 1 from public.weeks w where w.week_start = e.week_start)
  loop
    if public.event_has_people(ev.id) then
      update public.events set crew_outdated = true where id = ev.id;
    else
      perform public.rebuild_event_slots(ev.id);
      perform public.mark_week_dirty(ev.week_start);
    end if;
  end loop;
end;
$$;

create function public.op_service_type_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_name text := public.clean_name(pl ->> 'name');
  v_crew jsonb := coalesce(pl -> 'crew', '[]');
  v_no_team boolean := coalesce((pl ->> 'no_team')::boolean, false);
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

  select true, public.crew_signature(t.id), t.no_team into v_existed, v_before, v_before_no_team
  from public.service_types t where t.id = v_id;

  insert into public.service_types (id, name, keywords, no_team)
  values (
    v_id, v_name,
    array(select distinct btrim(k) from jsonb_array_elements_text(coalesce(pl -> 'keywords', '[]')) k where btrim(k) <> ''),
    v_no_team
  )
  on conflict (id) do update set name = excluded.name, keywords = excluded.keywords, no_team = excluded.no_team
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

-- Arquivar tipo em uso: eventos futuros dele voltam para "tipo a definir" com certeza baixa (US-005 EC-4).
create function public.op_service_type_archive(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := (pl ->> 'id')::uuid;
  v_version int;
begin
  update public.service_types set archived_at = coalesce(archived_at, now())
  where id = v_id returning version into v_version;
  if v_version is null then
    perform public.fail('not_found', 'Tipo de serviço não encontrado.');
  end if;
  update public.events set service_type_id = null, type_certainty = 'baixa', type_source = null
  where service_type_id = v_id and not public.is_week_past(week_start);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Eventos

create function public.op_event_update_extras(pl jsonb, p_base int) returns jsonb
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
    period_end = case when pl ? 'period_end' then (pl ->> 'period_end')::timestamptz else period_end end
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

-- Atividade interna (ADR-010): título, horário e local editáveis; vagas do tipo quando a semana já existe.
create function public.op_event_internal_upsert(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_start timestamptz := (pl ->> 'starts_at')::timestamptz;
  v_end timestamptz := (pl ->> 'ends_at')::timestamptz;
  v_title text := public.clean_name(pl ->> 'title');
  v_type uuid := (pl ->> 'service_type_id')::uuid;
  v_ws date;
  e public.events;
  v_version int;
begin
  if v_title = '' then
    perform public.fail('name_required', 'Informe o título.');
  end if;
  if v_start is null or v_end is null or v_end <= v_start then
    perform public.fail('end_before_start', 'O fim precisa ser depois do início.');
  end if;
  if char_length(coalesce(pl ->> 'notes', '')) > 2000 then
    perform public.fail('notes_too_long', 'A observação vai até 2.000 caracteres.');
  end if;
  v_ws := public.week_start_of(v_start);
  perform public.assert_week_open(v_ws);

  select * into e from public.events where id = v_id for update;
  if found then
    if e.origin <> 'internal' then
      perform public.fail('forbidden', 'Evento da agenda: corrija na Google Agenda.');
    end if;
    perform public.check_base(p_base, e.version, to_jsonb(e), pl);
    if e.status = 'cancelled' then
      perform public.fail('event_cancelled', 'Atividade cancelada não pode ser editada.');
    end if;
    perform public.assert_week_open(e.week_start);
    if v_type is distinct from e.service_type_id and public.event_has_people(e.id) and pl ->> 'mode' is null then
      perform public.fail('mode_required', 'A atividade já tem pessoas escaladas: escolha manter as vagas ou refazê-las.');
    end if;
    update public.events set
      title = v_title, location = pl ->> 'location', description = pl ->> 'description',
      starts_at = v_start, ends_at = v_end, all_day = coalesce((pl ->> 'all_day')::boolean, false),
      service_type_id = v_type,
      type_certainty = case when v_type is null then 'baixa' else 'alta' end,
      type_source = 'admin',
      no_team = coalesce((pl ->> 'no_team')::boolean, no_team),
      notes = case when pl ? 'notes' then pl ->> 'notes' else notes end
    where id = v_id
    returning version into v_version;
    if v_type is distinct from e.service_type_id
      and exists (select 1 from public.weeks w where w.week_start = v_ws)
      and (not public.event_has_people(v_id) or pl ->> 'mode' = 'rebuild') then
      perform public.rebuild_event_slots(v_id);
      select version into v_version from public.events where id = v_id;
    end if;
    perform public.mark_week_dirty(e.week_start);
  else
    insert into public.events (
      id, origin, title, location, description, starts_at, ends_at, all_day, service_type_id,
      type_certainty, type_source, no_team, notes
    ) values (
      v_id, 'internal', v_title, pl ->> 'location', pl ->> 'description', v_start, v_end,
      coalesce((pl ->> 'all_day')::boolean, false), v_type,
      case when v_type is null then 'baixa' else 'alta' end, 'admin',
      coalesce((pl ->> 'no_team')::boolean, false), pl ->> 'notes'
    )
    returning version into v_version;
    if exists (select 1 from public.weeks w where w.week_start = v_ws) then
      perform public.create_event_slots(v_id);
    end if;
  end if;
  perform public.mark_week_dirty(v_ws);
  return jsonb_build_object('status', 'applied', 'version', v_version, 'id', v_id);
end;
$$;

-- Cancelar atividade interna libera as pessoas; na semana publicada vira alteração não publicada.
create function public.op_event_internal_cancel(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  s record;
  v_version int;
begin
  select * into e from public.events where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Evento não encontrado.');
  end if;
  if e.origin <> 'internal' then
    perform public.fail('forbidden', 'Evento da agenda: cancele na Google Agenda.');
  end if;
  perform public.check_base(p_base, e.version, to_jsonb(e), pl);
  perform public.assert_week_open(e.week_start);
  if e.status = 'cancelled' then
    return jsonb_build_object('status', 'applied', 'version', e.version);
  end if;
  for s in select id from public.slots where event_id = e.id and archived_at is null loop
    perform public.open_slot(s.id);
  end loop;
  update public.events set status = 'cancelled' where id = e.id returning version into v_version;
  perform public.mark_week_dirty(e.week_start);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create function public.op_event_mark_reviewed(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_version int;
begin
  select * into e from public.events where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Evento não encontrado.');
  end if;
  perform public.check_base(p_base, e.version, to_jsonb(e), pl);
  update public.events set review_pending = false where id = e.id returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- Possível duplicado (US-010 EC-3): "manter um" ignora os outros do grupo, sem vagas; "manter os dois"
-- só tira a marca.
create function public.op_event_resolve_duplicate(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  o record;
  s record;
  v_version int;
begin
  select * into e from public.events where id = (pl ->> 'id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Evento não encontrado.');
  end if;
  perform public.check_base(p_base, e.version, to_jsonb(e), pl);
  if e.duplicate_group is not null then
    if coalesce(pl ->> 'keep', 'both') = 'one' then
      for o in
        select id, week_start from public.events
        where duplicate_group = e.duplicate_group and id <> e.id and not ignored
      loop
        for s in select id from public.slots where event_id = o.id and archived_at is null loop
          perform public.open_slot(s.id);
          update public.slots set archived_at = now() where id = s.id;
        end loop;
        update public.events set ignored = true, duplicate_group = null where id = o.id;
        perform public.mark_week_dirty(o.week_start);
      end loop;
    else
      update public.events set duplicate_group = null where duplicate_group = e.duplicate_group and id <> e.id;
    end if;
    update public.events set duplicate_group = null where id = e.id;
  end if;
  select version into v_version from public.events where id = e.id;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Semana e vagas

create function public.op_week_build(pl jsonb, p_base int) returns jsonb
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

create function public.op_slot_add(pl jsonb, p_base int) returns jsonb
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

create function public.op_slot_remove(pl jsonb, p_base int) returns jsonb
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

-- ---------------------------------------------------------------------------------------------
-- Escala

create function public.lock_assignment(pl jsonb, p_base int) returns public.assignments
language plpgsql security definer set search_path = ''
as $$
declare a public.assignments;
begin
  select * into a from public.assignments where slot_id = (pl ->> 'slot_id')::uuid for update;
  if not found then
    perform public.fail('not_found', 'Vaga não encontrada.');
  end if;
  perform public.check_base(p_base, a.version, to_jsonb(a), pl);
  if exists (select 1 from public.slots s where s.id = a.slot_id and s.archived_at is not null) then
    perform public.fail('not_found', 'Vaga removida.');
  end if;
  return a;
end;
$$;

-- Escalar à mão (US-015): bloqueio recusa; alerta só com "escalar mesmo assim" (override) e fica guardado.
create function public.op_assignment_set(pl jsonb, p_base int, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.assignments;
  ev public.events;
  v_person uuid := (pl ->> 'person_id')::uuid;
  v_override boolean := coalesce((pl ->> 'override')::boolean, false);
  v_elig jsonb;
  v_warnings text[];
  v_version int;
begin
  a := public.lock_assignment(pl, p_base);
  select * into ev from public.events where id = a.event_id;
  if v_person is null then
    perform public.fail('not_found', 'Escolha a pessoa.');
  end if;
  v_elig := public.check_eligibility(v_person, a.slot_id);
  if jsonb_array_length(v_elig -> 'blockers') > 0 then
    perform public.fail(v_elig -> 'blockers' ->> 0, public.blocker_detail(v_elig -> 'blockers' ->> 0));
  end if;
  v_warnings := array(select jsonb_array_elements_text(v_elig -> 'warnings'));
  if cardinality(v_warnings) > 0 and not v_override then
    perform public.fail('needs_override', format(
      'Alerta: %s. Confirme "escalar mesmo assim" para gravar.',
      array_to_string(array(select public.warning_label(w) from unnest(v_warnings) w), ', ')
    ));
  end if;
  if exists (
    select 1 from public.slots s join public.job_roles r on r.id = s.job_role_id
    where s.id = a.slot_id and r.archived_at is not null
  ) then
    v_warnings := v_warnings || 'role_archived'::text;
  end if;
  update public.assignments set
    person_id = v_person, status = 'confirmed', warnings = v_warnings,
    override = v_override and cardinality(v_warnings) > 0, reason = null,
    decided_by = me, decided_at = now()
  where id = a.id
  returning version into v_version;
  perform public.mark_week_dirty(ev.week_start);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create function public.op_assignment_clear(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.assignments;
  ev public.events;
  v_version int;
begin
  a := public.lock_assignment(pl, p_base);
  select * into ev from public.events where id = a.event_id;
  perform public.assert_week_open(ev.week_start);
  perform public.open_slot(a.slot_id);
  select version into v_version from public.assignments where id = a.id;
  perform public.mark_week_dirty(ev.week_start);
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create function public.op_assignment_lock(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.assignments;
  ev public.events;
  v_version int;
begin
  a := public.lock_assignment(pl, p_base);
  select * into ev from public.events where id = a.event_id;
  perform public.assert_week_open(ev.week_start);
  update public.assignments set locked = coalesce((pl ->> 'locked')::boolean, true)
  where id = a.id returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

create function public.decided_detail(a public.assignments) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when a.decided_by is null then 'Esta vaga já foi decidida.'
    else 'Esta vaga já foi decidida por ' || (select p.name from public.people p where p.id = a.decided_by) || '.'
  end
$$;

-- Aceitar proposta: revalida; se ficou inválida, recusa com o motivo e a vaga fica aberta (US-014 EC-1).
create function public.accept_one(a public.assignments, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_elig jsonb;
  v_code text;
  v_ws date;
begin
  v_elig := public.check_eligibility(a.person_id, a.slot_id);
  v_code := coalesce(v_elig -> 'blockers' ->> 0, v_elig -> 'warnings' ->> 0);
  if v_code is not null then
    if v_code <> 'week_past' then
      perform public.open_slot(a.slot_id);
    end if;
    return jsonb_build_object('status', 'rejected', 'code', v_code, 'message', public.blocker_detail(v_code));
  end if;
  update public.assignments set status = 'confirmed', decided_by = me, decided_at = now() where id = a.id;
  select e.week_start into v_ws from public.events e where e.id = a.event_id;
  perform public.mark_week_dirty(v_ws);
  return null;
end;
$$;

-- Aceita uma proposta (slot_id), todas de um evento (event_id) ou todas da semana (week_start).
create function public.op_assignment_accept(pl jsonb, p_base int, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.assignments;
  ev public.events;
  v_res jsonb;
  v_ok int := 0;
  v_rejected jsonb := '[]';
  v_version int;
begin
  if pl ? 'slot_id' then
    a := public.lock_assignment(pl, p_base);
  select * into ev from public.events where id = a.event_id;
    if a.status is distinct from 'proposed' then
      perform public.fail('already_decided', public.decided_detail(a));
    end if;
    v_res := public.accept_one(a, me);
    if v_res is not null then
      return v_res;
    end if;
    select version into v_version from public.assignments where id = a.id;
    return jsonb_build_object('status', 'applied', 'version', v_version, 'accepted', 1);
  end if;

  for a in
    select x.* from public.assignments x join public.events e on e.id = x.event_id
    where x.status = 'proposed'
      and (
        (pl ? 'event_id' and x.event_id = (pl ->> 'event_id')::uuid)
        or (pl ? 'week_start' and e.week_start = (pl ->> 'week_start')::date)
      )
    order by e.starts_at, x.slot_id
    for update of x
  loop
    v_res := public.accept_one(a, me);
    if v_res is null then
      v_ok := v_ok + 1;
    else
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('slot_id', a.slot_id, 'code', v_res ->> 'code'));
    end if;
  end loop;
  return jsonb_build_object('status', 'applied', 'version', v_ok, 'accepted', v_ok, 'rejected', v_rejected);
end;
$$;

create function public.op_assignment_discard(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.assignments;
  ev public.events;
  v_version int;
begin
  a := public.lock_assignment(pl, p_base);
  select * into ev from public.events where id = a.event_id;
  if a.status is distinct from 'proposed' then
    perform public.fail('already_decided', public.decided_detail(a));
  end if;
  perform public.open_slot(a.slot_id);
  select version into v_version from public.assignments where id = a.id;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Configuração

create function public.op_settings_update(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_version int;
begin
  if pl ? 'calendar_poll_minutes' and (pl ->> 'calendar_poll_minutes')::numeric not between 5 and 120 then
    perform public.fail('invalid_limit', 'O intervalo da releitura vai de 5 a 120 minutos.');
  end if;
  update public.settings set
    calendar_poll_enabled = coalesce((pl ->> 'calendar_poll_enabled')::boolean, calendar_poll_enabled),
    calendar_poll_minutes = coalesce((pl ->> 'calendar_poll_minutes')::int, calendar_poll_minutes),
    ai_proposal_enabled = coalesce((pl ->> 'ai_proposal_enabled')::boolean, ai_proposal_enabled),
    ai_classification_enabled = coalesce((pl ->> 'ai_classification_enabled')::boolean, ai_classification_enabled),
    ai_provider = coalesce(pl ->> 'ai_provider', ai_provider),
    ai_model = coalesce(pl ->> 'ai_model', ai_model),
    push_enabled_global = coalesce((pl ->> 'push_enabled_global')::boolean, push_enabled_global)
  where singleton
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Despacho e laço

create function public.apply_op(op jsonb, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  k text := op ->> 'kind';
  pl jsonb := coalesce(op -> 'payload', '{}');
  b int := case when jsonb_typeof(op -> 'baseVersion') = 'number' then (op ->> 'baseVersion')::int end;
begin
  if jsonb_typeof(pl) <> 'object' then
    perform public.fail('invalid_op', 'Operação sem dados.');
  end if;
  return case k
    when 'person.upsert' then public.op_person_upsert(pl, me)
    when 'person.deactivate' then public.op_person_deactivate(pl, me)
    when 'person.reactivate' then public.op_person_reactivate(pl, me)
    when 'absence.upsert' then public.op_absence_upsert(pl)
    when 'absence.archive' then public.op_absence_archive(pl)
    when 'sector.upsert' then public.op_sector_upsert(pl)
    when 'sector.archive' then public.op_archive('sectors', pl)
    when 'job_role.upsert' then public.op_job_role_upsert(pl)
    when 'job_role.archive' then public.op_archive('job_roles', pl)
    when 'service_type.upsert' then public.op_service_type_upsert(pl)
    when 'service_type.archive' then public.op_service_type_archive(pl)
    when 'event.update_extras' then public.op_event_update_extras(pl, b)
    when 'event.internal_upsert' then public.op_event_internal_upsert(pl, b)
    when 'event.internal_cancel' then public.op_event_internal_cancel(pl, b)
    when 'event.mark_reviewed' then public.op_event_mark_reviewed(pl, b)
    when 'event.resolve_duplicate' then public.op_event_resolve_duplicate(pl, b)
    when 'week.build' then public.op_week_build(pl, b)
    when 'slot.add' then public.op_slot_add(pl, b)
    when 'slot.remove' then public.op_slot_remove(pl, b)
    when 'assignment.set' then public.op_assignment_set(pl, b, me)
    when 'assignment.clear' then public.op_assignment_clear(pl, b)
    when 'assignment.lock' then public.op_assignment_lock(pl, b)
    when 'assignment.accept' then public.op_assignment_accept(pl, b, me)
    when 'assignment.discard' then public.op_assignment_discard(pl, b)
    when 'settings.update' then public.op_settings_update(pl)
    else public.op_unknown(k)
  end;
end;
$$;

create function public.op_unknown(k text) returns jsonb
language plpgsql set search_path = ''
as $$
begin
  perform public.fail('invalid_op', format('Operação desconhecida: %s.', coalesce(k, 'sem tipo')));
  return null;
end;
$$;

create function public.unique_code(p_constraint text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_constraint = 'people_email_key' then 'email_taken'
    when p_constraint like '%name_key' then 'name_taken'
    when p_constraint = 'assignments_event_id_person_id_key' then 'same_event_twice'
    else 'invalid_op'
  end
$$;

create function public.apply_ops(ops jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.current_person();
  v_admin boolean := public.is_admin();
  op jsonb;
  v_op_id uuid;
  v_res jsonb;
  v_stored jsonb;
  v_claimed uuid;
  v_out jsonb := '[]';
  v_msg text;
  v_detail text;
  v_constraint text;
begin
  if ops is null or jsonb_typeof(ops) <> 'array' then
    perform public.fail('invalid_op', 'Envie uma lista de operações.');
  end if;
  if jsonb_array_length(ops) > 100 then
    perform public.fail('too_many_ops', 'Envie no máximo 100 operações por vez.');
  end if;

  for op in select x.value from jsonb_array_elements(ops) with ordinality x order by x.ordinality loop
    v_op_id := (op ->> 'opId')::uuid;
    if not v_admin then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'opId', v_op_id, 'status', 'rejected', 'code', 'forbidden',
        'message', 'Só administradores alteram cadastros, eventos e escala.'
      ));
      continue;
    end if;

    select r.result into v_stored from public.applied_ops r where r.op_id = v_op_id and r.result is not null;
    if found then
      v_out := v_out || jsonb_build_array(v_stored);
      continue;
    end if;

    begin
      v_claimed := null;
      insert into public.applied_ops (op_id, person_id, kind) values (v_op_id, me, op ->> 'kind')
      on conflict (op_id) do nothing
      returning op_id into v_claimed;
      if v_claimed is null then
        -- Mesmo op_id enviado ao mesmo tempo: devolve o que a outra chamada gravou.
        select r.result into v_res from public.applied_ops r where r.op_id = v_op_id;
      else
        v_res := jsonb_build_object('opId', v_op_id) || public.apply_op(op, me);
        update public.applied_ops set result = v_res where op_id = v_op_id;
      end if;
    exception
      when sqlstate 'P0001' then
        get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
        if v_msg = 'conflict' then
          v_res := jsonb_build_object('opId', v_op_id, 'status', 'conflict') || v_detail::jsonb;
        else
          v_res := jsonb_build_object('opId', v_op_id, 'status', 'rejected', 'code', v_msg, 'message', coalesce(nullif(v_detail, ''), v_msg));
        end if;
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        v_res := jsonb_build_object(
          'opId', v_op_id, 'status', 'rejected', 'code', public.unique_code(v_constraint),
          'message', case public.unique_code(v_constraint)
            when 'email_taken' then 'Já existe uma pessoa com este e-mail.'
            when 'name_taken' then 'Já existe um cadastro com este nome.'
            when 'same_event_twice' then 'Esta pessoa já está neste evento.'
            else 'Operação recusada.' end
        );
      when others then
        get stacked diagnostics v_msg = message_text;
        v_res := jsonb_build_object('opId', v_op_id, 'status', 'rejected', 'code', 'invalid_op', 'message', v_msg);
    end;

    -- Recusa também fica guardada: o reenvio do mesmo op_id dá a mesma resposta. Conflito não, porque
    -- "minha versão" reenvia o mesmo op_id com a versão nova (UT-074).
    if v_res ->> 'status' = 'rejected' then
      insert into public.applied_ops (op_id, person_id, kind, result) values (v_op_id, me, op ->> 'kind', v_res)
      on conflict (op_id) do update set result = excluded.result where public.applied_ops.result is null;
    end if;
    v_out := v_out || jsonb_build_array(v_res);
  end loop;
  return v_out;
end;
$$;
