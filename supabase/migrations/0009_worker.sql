-- Apoio ao serviço de fundo (tarefa 4): bucket dos feeds iCal, histórico legível pela service_role, gravação
-- das mudanças da agenda e das propostas da IA numa transação, troca da chave da IA depois do teste e
-- situação dos convites. Nada daqui é chamado pelos aparelhos.

-- Feeds iCal (ADR-006): bucket público com caminho secreto ical/<token>.ics. Sem política em storage.objects,
-- então ninguém lista o bucket; só a service_role grava e apaga.
insert into storage.buckets (id, name, public)
values ('ical', 'ical', true)
on conflict (id) do update set public = true;

-- Origem desligada ou sem autorização: os eventos dela ficam com os últimos dados lidos e com a marca
-- "origem desconectada" (US-009 AC-2, EC-2). Só o worker grava.
alter table public.events add column source_disconnected boolean not null default false;

-- history_facts passa a valer também para a service_role (ranking e classificação no worker). A definição é a
-- mesma de 0007, só o filtro de quem lê muda.
create or replace view public.history_facts with (security_barrier) as
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
where h.archived_at is null and ((select public.is_admin()) or (select auth.role()) = 'service_role')
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
  and ((select public.is_admin()) or (select auth.role()) = 'service_role');

revoke all on public.history_facts from anon, authenticated;
grant select on public.history_facts to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Avisos aos administradores ativos. p_once: não mexe num aviso que já existe (lembretes); senão o
-- mesmo dedupe_key atualiza o aviso e o reenvia (notify).

create function public.notify_admins(
  p_kind text, p_title text, p_body text, p_link text, p_dedupe text, p_once boolean default false
) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin uuid;
  n int := 0;
begin
  for v_admin in select p.id from public.people p where p.profile = 'admin' and p.active order by p.code loop
    if p_once then
      insert into public.notifications (person_id, kind, title, body, link, dedupe_key)
      values (v_admin, p_kind, p_title, p_body, p_link, p_dedupe)
      on conflict (person_id, dedupe_key) do nothing;
    else
      perform public.notify(v_admin, p_kind, p_title, p_body, p_link, p_dedupe);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- "22/10 14:00 às 17:00" ou "22/10 (dia inteiro)".
create function public.fmt_span(p_start timestamptz, p_end timestamptz, p_all_day boolean) returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_all_day then to_char(p_start at time zone 'America/Sao_Paulo', 'DD/MM') || ' (dia inteiro)'
    else public.fmt_when(p_start) || ' às ' || to_char(p_end at time zone 'America/Sao_Paulo', 'HH24:MI')
  end
$$;

-- Quem a equipe vê escalado no evento: a fotografia publicada corrente da semana dele (ADR-011).
create function public.published_people(p_event uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct x.person_id), '{}')
  from public.published_assignments x
  join public.weeks w on w.id = x.week_id and x.revision = w.revision
  where x.event_id = p_event and x.person_id is not null and w.state = 'published'
$$;

-- Aviso a quem está escalado (publicado) e aos administradores.
create function public.notify_event(
  p_event uuid, p_people uuid[], p_kind text, p_title text, p_body text, p_dedupe text
) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid;
  n int := 0;
begin
  foreach v_person in array p_people loop
    perform public.notify(v_person, p_kind, p_title, p_body, '#/evento/' || p_event, p_dedupe);
    n := n + 1;
  end loop;
  return n + public.notify_admins(p_kind, p_title, p_body, '#/evento/' || p_event, p_dedupe);
end;
$$;

-- Libera as pessoas do evento: vagas abertas, mesmo travadas (US-011 AC-3).
create function public.release_event(p_event uuid, p_archive boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  for s in select id from public.slots where event_id = p_event and archived_at is null loop
    perform public.open_slot(s.id);
    if p_archive then
      update public.slots set archived_at = now() where id = s.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Mudança lida da Google Agenda (ADR-003, ADR-007), já classificada por diffCalendarEvent no worker:
-- p_change = { kind: new|changed|cancelled|restored|moved_week, after: EventSnapshot, fingerprint, notify, from, to }
-- e p_type = { service_type_id, certainty, source, no_team } para eventos novos. Tudo numa transação.
-- Semana passada (notify=false) só grava os dados, sem aviso (US-011 EC-8).

create function public.worker_apply_calendar_change(
  p_source uuid, p_google_id text, p_change jsonb, p_type jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  k text := p_change ->> 'kind';
  a jsonb := p_change -> 'after';
  v_notify boolean := coalesce((p_change ->> 'notify')::boolean, false);
  e public.events;
  n public.events;
  v_built boolean;
  v_people uuid[];
  v_before text;
  v_found boolean;
  v_notified int := 0;
begin
  select * into e from public.events
  where calendar_source_id = p_source and google_event_id = p_google_id for update;
  v_found := found;

  -- Sai da semana antiga como cancelado (o google_event_id fica livre para a linha nova) e entra na nova.
  if k in ('cancelled', 'moved_week') then
    if not v_found or e.status = 'cancelled' then
      return jsonb_build_object('kind', 'unchanged');
    end if;
    v_built := exists (select 1 from public.weeks w where w.week_start = e.week_start);
    v_people := public.published_people(e.id);
    perform public.release_event(e.id, false);
    update public.events set
      status = 'cancelled',
      review_pending = v_built and v_notify,
      source_disconnected = false,
      google_event_id = case when k = 'moved_week' then p_google_id || '@' || e.week_start::text else google_event_id end
    where id = e.id;
    if v_notify and (v_built or cardinality(v_people) > 0) then
      v_notified := public.notify_event(
        e.id, v_people, 'event_cancelled',
        'Cancelado: ' || coalesce(nullif(e.title, ''), 'Atividade'),
        public.fmt_span(e.starts_at, e.ends_at, e.all_day)
          || case when k = 'moved_week'
               then '. Mudou para ' || public.fmt_span((a ->> 'startsAt')::timestamptz, (a ->> 'endsAt')::timestamptz, (a ->> 'allDay')::boolean) || '.'
               else '. O evento saiu da Google Agenda.' end,
        'calendar:cancel:' || e.id
      );
    end if;
    if k = 'cancelled' then
      return jsonb_build_object('kind', k, 'event_id', e.id, 'notified', v_notified);
    end if;
  end if;

  if k in ('new', 'moved_week') then
    if k = 'new' and v_found then
      return jsonb_build_object('kind', 'unchanged', 'event_id', e.id);
    end if;
    insert into public.events (
      origin, calendar_source_id, google_event_id, title, location, description, starts_at, ends_at, all_day,
      fingerprint, service_type_id, type_certainty, type_source, no_team, notes
    ) values (
      'calendar', p_source, p_google_id, coalesce(a ->> 'title', ''), a ->> 'location', a ->> 'description',
      (a ->> 'startsAt')::timestamptz, (a ->> 'endsAt')::timestamptz, coalesce((a ->> 'allDay')::boolean, false),
      p_change ->> 'fingerprint',
      case when k = 'moved_week' then e.service_type_id else (p_type ->> 'service_type_id')::uuid end,
      case when k = 'moved_week' then e.type_certainty else coalesce(p_type ->> 'certainty', 'baixa') end,
      case when k = 'moved_week' then e.type_source else p_type ->> 'source' end,
      case when k = 'moved_week' then e.no_team else coalesce((p_type ->> 'no_team')::boolean, false) end,
      case when k = 'moved_week' then e.notes end
    ) returning * into n;
    -- Evento que chega numa semana já montada entra sem escala, nas pendências (US-011 AC-4, EC-3).
    v_built := exists (select 1 from public.weeks w where w.week_start = n.week_start);
    if v_built and not public.is_week_past(n.week_start) then
      update public.events set review_pending = true where id = n.id;
      if v_notify then
        v_notified := v_notified + public.notify_admins(
          'calendar_new', 'Evento novo na agenda: ' || coalesce(nullif(n.title, ''), 'Atividade'),
          public.fmt_span(n.starts_at, n.ends_at, n.all_day) || '. Está sem escala.',
          '#/evento/' || n.id, 'calendar:new:' || n.id
        );
      end if;
    end if;
    return jsonb_build_object('kind', k, 'event_id', n.id, 'from_event_id', e.id, 'notified', v_notified);
  end if;

  if not v_found then
    return jsonb_build_object('kind', 'unchanged');
  end if;
  v_built := exists (select 1 from public.weeks w where w.week_start = e.week_start);

  -- Cancelado que volta: evento novo sem escala, com a nota "restaurado" (US-011 EC-2).
  if k = 'restored' then
    perform public.release_event(e.id, true);
    update public.events set
      title = coalesce(a ->> 'title', ''), location = a ->> 'location', description = a ->> 'description',
      starts_at = (a ->> 'startsAt')::timestamptz, ends_at = (a ->> 'endsAt')::timestamptz,
      all_day = coalesce((a ->> 'allDay')::boolean, false), fingerprint = p_change ->> 'fingerprint',
      status = 'active', restored = true, change_original = null, source_disconnected = false
    where id = e.id
    returning * into n;
    v_built := exists (select 1 from public.weeks w where w.week_start = n.week_start);
    update public.events set review_pending = v_built and v_notify where id = n.id;
    if v_built and v_notify then
      v_notified := public.notify_admins(
        'calendar_new', 'Evento restaurado na agenda: ' || coalesce(nullif(n.title, ''), 'Atividade'),
        public.fmt_span(n.starts_at, n.ends_at, n.all_day) || '. Voltou sem escala.',
        '#/evento/' || n.id, 'calendar:new:' || n.id
      );
    end if;
    return jsonb_build_object('kind', k, 'event_id', n.id, 'notified', v_notified);
  end if;

  if k = 'changed' then
    v_people := public.published_people(e.id);
    v_before := public.fmt_span(e.starts_at, e.ends_at, e.all_day) || coalesce(', ' || e.location, '');
    update public.events set
      title = coalesce(a ->> 'title', ''), location = a ->> 'location', description = a ->> 'description',
      starts_at = (a ->> 'startsAt')::timestamptz, ends_at = (a ->> 'endsAt')::timestamptz,
      all_day = coalesce((a ->> 'allDay')::boolean, false), fingerprint = p_change ->> 'fingerprint',
      source_disconnected = false,
      -- Várias mudanças antes da revisão: guarda o estado original uma vez só (US-011 EC-1).
      status = case when v_built and v_notify then 'changed' else status end,
      change_original = case
        when not (v_built and v_notify) then change_original
        when review_pending and change_original is not null then change_original
        else jsonb_build_object(
          'title', e.title, 'location', e.location, 'description', e.description,
          'startsAt', e.starts_at, 'endsAt', e.ends_at, 'allDay', e.all_day)
      end,
      review_pending = review_pending or (v_built and v_notify)
    where id = e.id
    returning * into n;
    if v_notify and (v_built or cardinality(v_people) > 0) then
      v_notified := public.notify_event(
        n.id, v_people, 'event_changed',
        'Mudou: ' || coalesce(nullif(n.title, ''), 'Atividade'),
        'Antes: ' || coalesce(
          public.fmt_span((n.change_original ->> 'startsAt')::timestamptz, (n.change_original ->> 'endsAt')::timestamptz, (n.change_original ->> 'allDay')::boolean)
            || coalesce(', ' || (n.change_original ->> 'location'), ''),
          v_before)
          || '. Agora: ' || public.fmt_span(n.starts_at, n.ends_at, n.all_day) || coalesce(', ' || n.location, '') || '.',
        'calendar:change:' || n.id || ':' || md5(coalesce(n.change_original::text, v_before))
      );
    end if;
    return jsonb_build_object('kind', k, 'event_id', n.id, 'notified', v_notified);
  end if;

  return jsonb_build_object('kind', 'unchanged', 'event_id', e.id);
end;
$$;

-- Origem desligada ou sem autorização: marca os eventos escalados dela; origem lida de novo tira a marca.
create function public.mark_source_disconnected(p_source uuid, p_disconnected boolean) returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  update public.events e set source_disconnected = p_disconnected
  where e.calendar_source_id = p_source and e.source_disconnected is distinct from p_disconnected
    and (not p_disconnected or public.event_has_people(e.id));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Propostas da IA (ADR-012): p_items = [{ slot_id, person_id | null, reason, keep_person }]. Nunca toca vaga
-- confirmada nem travada (US-013 AC-2). keep_person: só anota a vaga se ela estiver vazia ("sem proposta").

create function public.worker_write_proposals(p_items jsonb) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  it jsonb;
  v_person uuid;
  n int := 0;
  c int;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    v_person := (it ->> 'person_id')::uuid;
    update public.assignments a set
      person_id = v_person,
      status = case when v_person is null then null else 'proposed' end,
      reason = it ->> 'reason',
      warnings = coalesce(array(select 'role_archived'::text from public.slots s join public.job_roles r on r.id = s.job_role_id
                                where s.id = a.slot_id and r.archived_at is not null), '{}'),
      override = false, decided_by = null, decided_at = null
    where a.slot_id = (it ->> 'slot_id')::uuid and not a.locked and a.status is distinct from 'confirmed'
      and (not coalesce((it ->> 'keep_person')::boolean, false) or a.person_id is null);
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Chave da IA aprovada no teste (US-016): a pendente vira a chave em uso e o final dela aparece na configuração.
create function public.promote_ai_key(p_hint text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_key text;
begin
  select s.value into v_key from private.secrets s where s.name = 'ai_key_pending';
  if v_key is null then
    return;
  end if;
  insert into private.secrets (name, value) values ('ai_key', v_key)
  on conflict (name) do update set value = excluded.value, updated_at = now();
  delete from private.secrets where name = 'ai_key_pending';
  update public.settings set ai_key_hint = coalesce(p_hint, '...' || right(v_key, 4)) where singleton;
end;
$$;

-- Chave recusada: some a pendente e a anterior continua valendo (US-016 EC-1).
create function public.drop_pending_ai_key() returns void
language sql security definer set search_path = ''
as $$ delete from private.secrets where name = 'ai_key_pending' $$;

-- Convite aceito: a pessoa já entrou pelo menos uma vez com a senha criada.
create function public.sync_invite_status() returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  update public.people p set invite_status = 'accepted'
  from auth.users u
  where u.id = p.auth_user_id and p.invite_status <> 'accepted' and u.last_sign_in_at is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function
  public.notify_admins(text, text, text, text, text, boolean),
  public.fmt_span(timestamptz, timestamptz, boolean),
  public.published_people(uuid),
  public.notify_event(uuid, uuid[], text, text, text, text),
  public.release_event(uuid, boolean),
  public.worker_apply_calendar_change(uuid, text, jsonb, jsonb),
  public.mark_source_disconnected(uuid, boolean),
  public.worker_write_proposals(jsonb),
  public.promote_ai_key(text),
  public.drop_pending_ai_key(),
  public.sync_invite_status()
from public, anon, authenticated;

grant execute on function
  public.notify_admins(text, text, text, text, text, boolean),
  public.fmt_span(timestamptz, timestamptz, boolean),
  public.published_people(uuid),
  public.notify_event(uuid, uuid[], text, text, text, text),
  public.release_event(uuid, boolean),
  public.worker_apply_calendar_change(uuid, text, jsonb, jsonb),
  public.mark_source_disconnected(uuid, boolean),
  public.worker_write_proposals(jsonb),
  public.promote_ai_key(text),
  public.drop_pending_ai_key(),
  public.sync_invite_status()
to service_role;
