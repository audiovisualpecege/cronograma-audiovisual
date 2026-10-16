-- Publicação por fotografia (ADR-004, ADR-011): publish_week grava a revisão nova de published_assignments,
-- os avisos e o registro em publications numa transação; discard_week_changes volta a escala à fotografia.

-- Aviso para uma pessoa; o mesmo (person_id, dedupe_key) atualiza a linha em vez de duplicar (US-022 EC-4).
create function public.notify(
  p_person uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare nid uuid;
begin
  insert into public.notifications (person_id, kind, title, body, link, dedupe_key)
  values (p_person, p_kind, p_title, p_body, p_link, p_dedupe)
  on conflict (person_id, dedupe_key) do update set
    kind = excluded.kind, title = excluded.title, body = excluded.body, link = excluded.link,
    read_at = null, pushed_at = null, created_at = now()
  returning id into nid;
  return nid;
end;
$$;

create function public.fmt_day(d date) returns text
language sql immutable set search_path = ''
as $$ select to_char(d, 'DD/MM') $$;

create function public.fmt_when(ts timestamptz) returns text
language sql immutable set search_path = ''
as $$ select to_char(ts at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') $$;

-- Uma linha do resumo de mudanças de uma pessoa: "Entrou: Título (Função), 28/10 09:00".
create function public.change_line(p_prefix text, p_event uuid, p_role uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select p_prefix || ': ' || coalesce(nullif(e.title, ''), 'Atividade') || ' (' || r.name || '), ' || public.fmt_when(e.starts_at)
  from public.events e, public.job_roles r where e.id = p_event and r.id = p_role
$$;

-- Avisos da publicação de alterações: um por pessoa afetada, com o que mudou para ela (diffPublication do
-- core). Quem saiu e voltou para a mesma vaga não aparece.
create function public.notify_changes(p_week public.weeks, p_prev int, p_next int, p_link text, p_dedupe text) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
  v_lines text[];
  n int := 0;
begin
  for v_person in
    select distinct x.person_id from public.published_assignments x
    where x.week_id = p_week.id and x.revision in (p_prev, p_next) and x.person_id is not null
    order by 1
  loop
    with prev as (
      select distinct x.event_id, x.job_role_id from public.published_assignments x
      where x.week_id = p_week.id and x.revision = p_prev and x.person_id = v_person
    ), next as (
      select distinct x.event_id, x.job_role_id from public.published_assignments x
      where x.week_id = p_week.id and x.revision = p_next and x.person_id = v_person
    ), removed as (
      select * from prev except select * from next
    ), added as (
      select * from next except select * from prev
    ), lines as (
      select 1 as ord, a.event_id, public.change_line('Mudou de função', a.event_id, a.job_role_id) as line
      from added a where exists (select 1 from removed r where r.event_id = a.event_id)
      union all
      select 2, a.event_id, public.change_line('Entrou', a.event_id, a.job_role_id)
      from added a where not exists (select 1 from removed r where r.event_id = a.event_id)
      union all
      select 3, r.event_id, public.change_line('Saiu', r.event_id, r.job_role_id)
      from removed r where not exists (select 1 from added a where a.event_id = r.event_id)
    )
    select coalesce(array_agg(l.line order by l.ord, l.line), '{}') into v_lines from lines l;

    if cardinality(v_lines) > 0 then
      perform public.notify(
        v_person, 'week_changed', 'Sua semana de ' || public.fmt_day(p_week.week_start) || ' mudou',
        array_to_string(v_lines, E'\n'), p_link, p_dedupe
      );
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create function public.publish_week(week_id uuid, expected_revision int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_person();
  w public.weeks;
  v_pub public.publications;
  v_rev int;
  v_kind text;
  v_link text;
  v_dedupe text;
  v_notified int := 0;
  v_person record;
  v_open int;
  v_filled int;
begin
  if not public.is_admin() then
    perform public.fail('forbidden', 'Só administradores publicam a semana.');
  end if;
  select * into w from public.weeks x where x.id = publish_week.week_id for update;
  if not found then
    perform public.fail('not_found', 'Semana não encontrada.');
  end if;

  if w.revision <> publish_week.expected_revision then
    -- Clique repetido de quem publicou: devolve a mesma publicação, sem aviso novo.
    select * into v_pub from public.publications p
    where p.week_id = w.id and p.revision = publish_week.expected_revision + 1;
    if found and v_pub.published_by = me then
      return jsonb_build_object('revision', v_pub.revision, 'notified', coalesce((v_pub.summary ->> 'notified')::int, 0), 'repeated', true);
    end if;
    select * into v_pub from public.publications p where p.week_id = w.id order by p.revision desc limit 1;
    perform public.fail('stale_revision', format(
      'Esta semana já foi publicada por %s em %s. Confira a versão atual antes de publicar de novo.',
      coalesce((select p.name from public.people p where p.id = v_pub.published_by), 'outro administrador'),
      coalesce(public.fmt_when(v_pub.published_at), '')
    ));
  end if;
  if w.state = 'building' and public.is_week_past(w.week_start) then
    perform public.fail('week_past', 'Semana passada não pode ser publicada pela primeira vez.');
  end if;

  v_rev := w.revision + 1;
  v_kind := case when w.state = 'building' then 'week' else 'changes' end;
  v_link := '#/minha-semana/' || w.week_start::text;
  v_dedupe := 'publish:' || w.id::text || ':' || v_rev;

  -- Fotografia: vagas ativas de eventos que exigem equipe; só confirmadas levam pessoa ("a definir").
  insert into public.published_assignments (week_id, revision, event_id, slot_id, job_role_id, person_id, notes)
  select w.id, v_rev, e.id, s.id, s.job_role_id, case when a.status = 'confirmed' then a.person_id end, e.notes
  from public.slots s
  join public.events e on e.id = s.event_id
  left join public.assignments a on a.slot_id = s.id
  where e.week_start = w.week_start and s.archived_at is null and e.status <> 'cancelled'
    and not e.ignored and not e.no_team and not public.service_type_no_team(e.service_type_id);

  if v_kind = 'week' then
    for v_person in
      select x.person_id, count(distinct x.event_id) as n
      from public.published_assignments x
      where x.week_id = w.id and x.revision = v_rev and x.person_id is not null
      group by x.person_id order by x.person_id
    loop
      perform public.notify(
        v_person.person_id, 'week_published',
        'Sua semana de ' || public.fmt_day(w.week_start) || ' foi publicada',
        case when v_person.n = 1 then 'Você tem 1 atividade nesta semana.'
             else 'Você tem ' || v_person.n || ' atividades nesta semana.' end,
        v_link, v_dedupe
      );
      v_notified := v_notified + 1;
    end loop;
  else
    v_notified := public.notify_changes(w, w.revision, v_rev, v_link, v_dedupe);
  end if;

  select count(*) filter (where x.person_id is null), count(*) filter (where x.person_id is not null)
  into v_open, v_filled
  from public.published_assignments x where x.week_id = w.id and x.revision = v_rev;

  update public.weeks set
    state = 'published', revision = v_rev, dirty_since = null, published_at = now(), published_by = me
  where id = w.id;
  insert into public.publications (week_id, revision, kind, published_by, published_at, summary)
  values (w.id, v_rev, v_kind, me, now(), jsonb_build_object('notified', v_notified, 'open_slots', v_open, 'filled', v_filled));

  return jsonb_build_object('revision', v_rev, 'notified', v_notified);
end;
$$;

-- Descartar alterações: vagas e alocações voltam à fotografia corrente e a semana fica sem pendências.
create function public.discard_week_changes(week_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := public.current_person();
  w public.weeks;
  r record;
  n int := 0;
  v_changed boolean;
  v_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    perform public.fail('forbidden', 'Só administradores descartam alterações.');
  end if;
  select * into w from public.weeks x where x.id = discard_week_changes.week_id for update;
  if not found then
    perform public.fail('not_found', 'Semana não encontrada.');
  end if;
  if w.state <> 'published' then
    return jsonb_build_object('restored_slots', 0);
  end if;

  -- Vagas da fotografia: reativa e devolve a pessoa publicada (ou deixa aberta).
  for r in
    select x.slot_id, x.person_id, a.id as assignment_id, a.person_id as cur_person, a.status as cur_status,
           s.archived_at
    from public.published_assignments x
    join public.slots s on s.id = x.slot_id
    join public.assignments a on a.slot_id = x.slot_id
    where x.week_id = w.id and x.revision = w.revision
  loop
    v_changed := false;
    if r.archived_at is not null then
      update public.slots set archived_at = null where id = r.slot_id;
      v_changed := true;
    end if;
    if r.cur_person is distinct from r.person_id
       or r.cur_status is distinct from (case when r.person_id is null then null else 'confirmed' end) then
      update public.assignments set
        person_id = r.person_id,
        status = case when r.person_id is null then null else 'confirmed' end,
        override = false, reason = null, decided_by = me, decided_at = now()
      where id = r.assignment_id;
      v_changed := true;
    end if;
    if v_changed then
      n := n + 1;
      v_ids := v_ids || r.assignment_id;
    end if;
  end loop;

  -- Vagas criadas depois da publicação em eventos publicados saem; nos eventos fora da fotografia
  -- (novos da agenda ou internos) a escala volta a aberta.
  for r in
    select s.id as slot_id, a.person_id,
           exists (select 1 from public.published_assignments x
                   where x.week_id = w.id and x.revision = w.revision and x.event_id = s.event_id) as published_event
    from public.slots s
    join public.events e on e.id = s.event_id
    join public.assignments a on a.slot_id = s.id
    where e.week_start = w.week_start and s.archived_at is null
      and not exists (select 1 from public.published_assignments x
                      where x.week_id = w.id and x.revision = w.revision and x.slot_id = s.id)
  loop
    if r.published_event then
      perform public.open_slot(r.slot_id);
      update public.slots set archived_at = now() where id = r.slot_id;
      n := n + 1;
    elsif r.person_id is not null then
      perform public.open_slot(r.slot_id);
      n := n + 1;
    end if;
  end loop;

  -- Observações voltam ao texto publicado.
  update public.events e set notes = x.notes
  from (select distinct on (event_id) event_id, notes from public.published_assignments
        where week_id = w.id and revision = w.revision order by event_id) x
  where e.id = x.event_id and e.notes is distinct from x.notes;

  perform public.recompute_warnings(v_ids);
  update public.weeks set dirty_since = null where id = w.id;
  return jsonb_build_object('restored_slots', n);
end;
$$;
