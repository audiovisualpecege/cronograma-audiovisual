-- Importação do histórico das planilhas (US-007) e a view history_facts (US-008).

-- Função escrita na planilha: ligação escolhida na revisão, ou o nome ou código do cadastro. Rótulo que
-- não bate com nada recusa a importação inteira.
create function public.resolve_import_role(p_label text, p_links jsonb) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare rid uuid;
begin
  if p_label is null or btrim(p_label) = '' then
    return null;
  end if;
  if p_links ? p_label then
    if p_links ->> p_label is null then
      return null;
    end if;
    select r.id into rid from public.job_roles r where r.id = (p_links ->> p_label)::uuid;
  else
    select r.id into rid from public.job_roles r
    where public.norm_name(r.name) = public.norm_name(p_label) or r.code = upper(btrim(p_label));
  end if;
  if rid is null then
    perform public.fail('invalid_import', format(
      'A função "%s" da planilha não existe no cadastro. Ligue-a a uma função e importe de novo.', p_label
    ));
  end if;
  return rid;
end;
$$;

-- Tipo escrito na planilha; sem correspondência fica sem tipo.
create function public.resolve_import_type(p_label text, p_links jsonb) returns uuid
language sql stable security definer set search_path = ''
as $$
  select case
    when p_label is null or btrim(p_label) = '' then null
    when p_links ? p_label then (p_links ->> p_label)::uuid
    else (select t.id from public.service_types t
          where public.norm_name(t.name) = public.norm_name(p_label) or t.code = upper(btrim(p_label)) limit 1)
  end
$$;

-- Grava o plano revisado numa transação: tudo ou nada (US-007 EC-6). Semanas com linha em weeks nunca
-- recebem linhas (EC-9); semana já importada só é trocada quando está em replace_weeks (EC-4).
-- name_links: { "<nome na planilha>": { "person_id": uuid } | { "create": true, "name"?: texto } | { "ignore": true } }.
-- Nome sem ligação usa a pessoa de mesmo nome no cadastro, se houver, e guarda o nome lido.
create function public.commit_history_import(
  file_name text,
  weeks jsonb,
  name_links jsonb default '{}',
  replace_weeks jsonb default '[]',
  role_links jsonb default '{}',
  type_links jsonb default '{}'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_person();
  v_names jsonb := coalesce(commit_history_import.name_links, '{}');
  v_roles jsonb := coalesce(commit_history_import.role_links, '{}');
  v_types jsonb := coalesce(commit_history_import.type_links, '{}');
  v_replace jsonb := coalesce(commit_history_import.replace_weeks, '[]');
  v_created jsonb := '{}';
  v_import uuid;
  wk jsonb;
  ev record;
  asg jsonb;
  v_ws date;
  v_date date;
  v_hours numeric;
  v_type uuid;
  v_role uuid;
  v_person uuid;
  v_link jsonb;
  v_raw text;
  v_key text;
  v_rows int;
  c_weeks int := 0;
  c_events int := 0;
  c_assignments int := 0;
  c_skipped int := 0;
  v_counts jsonb;
begin
  if not public.is_admin() then
    perform public.fail('forbidden', 'Só administradores importam o histórico.');
  end if;
  if commit_history_import.weeks is null or jsonb_typeof(commit_history_import.weeks) <> 'array' then
    perform public.fail('invalid_import', 'Plano de importação sem semanas.');
  end if;

  insert into public.history_imports (file_name, imported_by)
  values (coalesce(commit_history_import.file_name, 'planilha.xlsx'), me)
  returning id into v_import;

  for wk in select x.value from jsonb_array_elements(commit_history_import.weeks) x loop
    v_ws := public.monday_of((wk ->> 'weekStart')::date);
    if exists (select 1 from public.weeks w where w.week_start = v_ws) then
      c_skipped := c_skipped + jsonb_array_length(coalesce(wk -> 'events', '[]'));
      continue;
    end if;
    if exists (select 1 from public.history_entries h where h.week_start = v_ws and h.archived_at is null) then
      if not (v_replace ? v_ws::text) then
        c_skipped := c_skipped + jsonb_array_length(coalesce(wk -> 'events', '[]'));
        continue;
      end if;
      update public.history_entries set archived_at = now() where week_start = v_ws and archived_at is null;
    end if;
    c_weeks := c_weeks + 1;

    for ev in select x.value as e, x.ordinality as idx from jsonb_array_elements(coalesce(wk -> 'events', '[]')) with ordinality x loop
      if coalesce((ev.e ->> 'cancelled')::boolean, false) then
        c_skipped := c_skipped + 1;
        continue;
      end if;
      v_date := (ev.e ->> 'date')::date;
      if coalesce((ev.e ->> 'allDay')::boolean, false) or ev.e ->> 'start' is null or ev.e ->> 'end' is null then
        v_hours := 0;
      else
        v_hours := greatest(0, extract(epoch from (
          ((coalesce((ev.e ->> 'endDate')::date, v_date) + (ev.e ->> 'end')::time) at time zone 'America/Sao_Paulo')
          - ((v_date + (ev.e ->> 'start')::time) at time zone 'America/Sao_Paulo')
        )) / 3600);
      end if;
      v_type := public.resolve_import_type(ev.e ->> 'typeLabel', v_types);
      v_key := v_import::text || ':' || coalesce(ev.e -> 'source' ->> 'sheet', '') || ':'
        || coalesce(ev.e -> 'source' ->> 'row', ev.idx::text);
      c_events := c_events + 1;
      v_rows := 0;

      for asg in select x.value from jsonb_array_elements(coalesce(ev.e -> 'assignments', '[]')) x loop
        v_raw := public.clean_name(asg ->> 'rawName');
        if v_raw = '' then
          continue;
        end if;
        v_link := v_names -> v_raw;
        if coalesce((v_link ->> 'ignore')::boolean, false) then
          continue;
        end if;
        if v_link ? 'person_id' then
          select p.id into v_person from public.people p where p.id = (v_link ->> 'person_id')::uuid;
          if v_person is null then
            perform public.fail('invalid_import', format('A pessoa ligada a "%s" não existe no cadastro.', v_raw));
          end if;
        elsif coalesce((v_link ->> 'create')::boolean, false) then
          v_person := (v_created ->> v_raw)::uuid;
          if v_person is null then
            insert into public.people (name, active, invite_status)
            values (coalesce(nullif(public.clean_name(v_link ->> 'name'), ''), v_raw), false, 'pending')
            returning id into v_person;
            v_created := v_created || jsonb_build_object(v_raw, v_person);
          end if;
        else
          select p.id into v_person from public.people p
          where public.norm_name(p.name) = public.norm_name(v_raw) order by p.active desc, p.code limit 1;
        end if;
        v_role := public.resolve_import_role(asg ->> 'role', v_roles);

        insert into public.history_entries (
          import_id, week_start, event_date, event_key, title, hours, service_type_id, job_role_id, person_id, raw_name
        ) values (
          v_import, v_ws, v_date, v_key, coalesce(ev.e ->> 'title', ''), v_hours, v_type, v_role, v_person, v_raw
        );
        c_assignments := c_assignments + 1;
        v_rows := v_rows + 1;
        v_person := null;
      end loop;

      -- Evento sem ninguém lido ainda conta para os padrões do tipo.
      if v_rows = 0 then
        insert into public.history_entries (import_id, week_start, event_date, event_key, title, hours, service_type_id)
        values (v_import, v_ws, v_date, v_key, coalesce(ev.e ->> 'title', ''), v_hours, v_type);
      end if;
    end loop;
  end loop;

  v_counts := jsonb_build_object('weeks', c_weeks, 'events', c_events, 'assignments', c_assignments, 'skipped', c_skipped);
  update public.history_imports set counts = v_counts where id = v_import;
  return v_counts;
end;
$$;

-- Base de "Padrões" e do ranking: linhas importadas mais a fotografia corrente das semanas arquivadas
-- publicadas na plataforma (US-008 EC-3). Nomes de função, tipo e pessoa vêm do cadastro atual, então
-- renomear uma função muda o histórico também (US-004 AC-2). Só administradores leem.
create view public.history_facts with (security_barrier) as
select
  'import:' || h.event_key as event_id,
  h.week_start,
  h.event_date,
  h.title,
  h.service_type_id,
  t.name as service_type_name,
  h.job_role_id,
  r.name as job_role_name,
  h.person_id,
  p.name as person_name,
  h.raw_name,
  h.hours,
  'import'::text as source
from public.history_entries h
left join public.service_types t on t.id = h.service_type_id
left join public.job_roles r on r.id = h.job_role_id
left join public.people p on p.id = h.person_id
where h.archived_at is null and (select public.is_admin())
union all
select
  x.event_id::text,
  w.week_start,
  public.local_date(e.starts_at),
  e.title,
  e.service_type_id,
  t.name,
  x.job_role_id,
  r.name,
  x.person_id,
  p.name,
  null,
  public.event_hours(e),
  'platform'::text
from public.published_assignments x
join public.weeks w on w.id = x.week_id and x.revision = w.revision
join public.events e on e.id = x.event_id
left join public.service_types t on t.id = e.service_type_id
left join public.job_roles r on r.id = x.job_role_id
left join public.people p on p.id = x.person_id
where w.state = 'published' and public.is_week_past(w.week_start) and e.status <> 'cancelled'
  and (select public.is_admin());

revoke all on public.history_facts from anon, authenticated;
grant select on public.history_facts to anon, authenticated;
