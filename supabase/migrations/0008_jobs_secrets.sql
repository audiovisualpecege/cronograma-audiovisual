-- Pedidos ao serviço de fundo, chave da IA, agenda pessoal, inscrição de push, tempo real e permissões
-- de execução das funções.

-- Pedido ao worker (ADR-006). Administradores pedem releitura, proposta, teste de chave e reenvio de
-- convite; qualquer pessoa ativa pede a publicação ou a revogação do próprio feed iCal. Pedido igual em
-- andamento devolve o mesmo job_id.
create function public.request_job(kind text, payload jsonb default '{}') returns jsonb
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

-- Chave da IA (US-016): guardada fora da API como pendente; o worker testa e só então troca a chave em uso
-- e grava ai_key_hint. Devolve só o final da chave.
create function public.set_ai_key(provider text, key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(set_ai_key.key, ''));
  v_hint text;
begin
  if not public.is_admin() then
    perform public.fail('forbidden', 'Só administradores configuram a IA.');
  end if;
  if char_length(v_key) < 8 then
    perform public.fail('invalid_key', 'Informe a chave completa do fornecedor.');
  end if;
  v_hint := '...' || right(v_key, 4);
  insert into private.secrets (name, value) values ('ai_key_pending', v_key)
  on conflict (name) do update set value = excluded.value, updated_at = now();
  perform public.enqueue_job(
    'test_ai_key',
    jsonb_build_object('provider', coalesce(set_ai_key.provider, 'gemini'), 'pending', true, 'hint', v_hint),
    'all', public.current_person()
  );
  return jsonb_build_object('hint', v_hint);
end;
$$;

-- Agenda pessoal (US-024): liga, gera link novo (o antigo é revogado) ou desliga. O endereço é relativo
-- ao projeto Supabase: o app junta com a sua URL.
create function public.set_ical_feed(enabled boolean, regenerate boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.current_person();
  p public.people;
  v_token text;
begin
  if me is null then
    perform public.fail('forbidden', 'Entre com uma conta ativa.');
  end if;
  select * into p from public.people where id = me for update;
  v_token := p.ical_token;

  if not coalesce(set_ical_feed.enabled, false) then
    if v_token is not null then
      perform public.enqueue_job('ical_revoke', jsonb_build_object('person_id', me, 'token', v_token), null, me);
      update public.people set ical_token = null where id = me;
    end if;
    return jsonb_build_object('url', null);
  end if;

  if v_token is null or coalesce(set_ical_feed.regenerate, false) then
    if v_token is not null then
      perform public.enqueue_job('ical_revoke', jsonb_build_object('person_id', me, 'token', v_token), null, me);
    end if;
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.people set ical_token = v_token where id = me;
  end if;
  perform public.enqueue_job('ical_publish', jsonb_build_object('person_id', me), me::text, me);
  return jsonb_build_object('url', '/storage/v1/object/public/ical/' || v_token || '.ics', 'token', v_token);
end;
$$;

-- Inscrição de Web Push do aparelho (corpo = PushSubscriptionJSON, mais userAgent opcional).
create function public.register_push(jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.current_person();
  v_endpoint text := $1 ->> 'endpoint';
  v_p256dh text := $1 -> 'keys' ->> 'p256dh';
  v_auth text := $1 -> 'keys' ->> 'auth';
  v_id uuid;
begin
  if me is null then
    perform public.fail('forbidden', 'Entre com uma conta ativa.');
  end if;
  if v_endpoint is null or v_p256dh is null or v_auth is null then
    perform public.fail('invalid_op', 'Inscrição de notificação incompleta.');
  end if;
  insert into public.push_subscriptions (person_id, endpoint, p256dh, auth, user_agent)
  values (me, v_endpoint, v_p256dh, v_auth, coalesce($1 ->> 'userAgent', $1 ->> 'user_agent'))
  on conflict (endpoint) do update set
    person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Segredos para o worker (service_role): o esquema private não é exposto pela API.
create function public.get_secret(p_name text) returns text
language sql stable security definer set search_path = ''
as $$ select s.value from private.secrets s where s.name = p_name $$;

create function public.set_secret(p_name text, p_value text) returns void
language sql security definer set search_path = ''
as $$
  insert into private.secrets (name, value) values (p_name, p_value)
  on conflict (name) do update set value = excluded.value, updated_at = now()
$$;

-- ---------------------------------------------------------------------------------------------
-- Tempo real: os aparelhos só usam o evento para disparar a leitura incremental (respeita a RLS).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.notifications, public.events, public.weeks, public.published_assignments,
      public.assignments, public.slots, public.jobs;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Execução: os aparelhos chamam só as RPCs da TechSpec e as funções usadas pelas políticas de RLS.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

grant execute on function
  public.apply_ops(jsonb),
  public.build_week(date),
  public.publish_week(uuid, int),
  public.discard_week_changes(uuid),
  public.commit_history_import(text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.request_job(text, jsonb),
  public.set_ai_key(text, text),
  public.set_ical_feed(boolean, boolean),
  public.register_push(jsonb),
  public.current_person(),
  public.is_admin(),
  public.service_type_no_team(uuid),
  public.published_revision(uuid),
  public.week_is_published(date)
to authenticated;

-- Funções puras chamadas dentro das views (people_public, history_facts): a permissão de execução é
-- conferida com o papel de quem consulta.
grant execute on function
  public.current_person(),
  public.is_admin(),
  public.app_now(),
  public.today_local(),
  public.local_date(timestamptz),
  public.is_week_past(date),
  public.event_hours(public.events)
to anon, authenticated;
