-- Desfaz a migração 0012_request_classify.sql: volta request_job (como na 0008) e build_week_internal
-- (como na 0005). Não mexe em dados. Rodar só se for desfazer a 1.1.0; ver docs/publicar-1.1.0.md.
-- Depois de rodar: npx supabase migration repair --status reverted 0012

begin;

create or replace function public.request_job(kind text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.current_person();
  v_admin boolean := public.is_admin();
  v_kind text := request_job.kind;
  v_payload jsonb := coalesce(request_job.payload, '{}');
  v_dedupe text;
  v_target uuid;
begin
  if me is null then
    perform public.fail('forbidden', 'Entre com uma conta ativa.');
  end if;
  if v_kind in ('calendar_sync', 'propose', 'test_ai_key', 'invite') and not v_admin then
    perform public.fail('forbidden', 'Só administradores fazem este pedido.');
  end if;

  case v_kind
    when 'calendar_sync' then
      v_payload := '{}';
      v_dedupe := 'all';
    when 'test_ai_key' then
      v_payload := '{}';
      v_dedupe := 'all';
    when 'propose' then
      select w.id into v_target from public.weeks w where w.id = (v_payload ->> 'week_id')::uuid;
      if v_target is null then
        perform public.fail('not_found', 'Monte a semana antes de pedir a proposta.');
      end if;
      v_payload := jsonb_build_object('week_id', v_target, 'replace_pending', coalesce((v_payload ->> 'replace_pending')::boolean, true));
      v_dedupe := v_target::text;
    when 'invite' then
      select p.id into v_target from public.people p where p.id = (v_payload ->> 'person_id')::uuid and p.active;
      if v_target is null then
        perform public.fail('not_found', 'Pessoa não encontrada ou inativa.');
      end if;
      v_payload := jsonb_build_object('person_id', v_target, 'resend', true);
      v_dedupe := v_target::text;
    when 'ical_publish' then
      v_payload := jsonb_build_object('person_id', me);
      v_dedupe := me::text;
    when 'ical_revoke' then
      v_payload := jsonb_build_object('person_id', me, 'token', (select p.ical_token from public.people p where p.id = me));
      v_dedupe := null;
    else
      perform public.fail('forbidden', 'Este pedido não pode ser feito pelo aparelho.');
  end case;

  return jsonb_build_object('job_id', public.enqueue_job(v_kind, v_payload, v_dedupe, me));
end;
$$;

create or replace function public.build_week_internal(p_ws date) returns jsonb
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

commit;
