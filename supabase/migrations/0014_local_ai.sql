-- IA local (1.1.0): o fornecedor pode ser o Gemini ou um modelo rodando na rede da empresa (MiniCPM5 ou outro,
-- num servidor Ollama, llama.cpp, LM Studio ou vLLM). O endereço e o modelo do local ficam em colunas próprias,
-- para trocar de um fornecedor para o outro sem perder a configuração de nenhum. Não mexe em dados.

alter table public.settings
  add column ai_local_url text check (ai_local_url is null or ai_local_url ~ '^https?://[^\s]+$'),
  add column ai_local_model text not null default 'minicpm5' check (btrim(ai_local_model) <> '');

create or replace function public.op_settings_update(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_version int;
begin
  if pl ? 'calendar_poll_minutes' and (pl ->> 'calendar_poll_minutes')::numeric not between 5 and 120 then
    perform public.fail('invalid_limit', 'O intervalo da releitura vai de 5 a 120 minutos.');
  end if;
  if pl ? 'ai_provider' and pl ->> 'ai_provider' not in ('gemini', 'local') then
    perform public.fail('invalid_provider', 'Fornecedor da IA desconhecido.');
  end if;
  if pl ? 'ai_local_url' and nullif(btrim(pl ->> 'ai_local_url'), '') is not null
     and btrim(pl ->> 'ai_local_url') !~ '^https?://[^\s]+$' then
    perform public.fail('invalid_url', 'O endereço do servidor começa com http:// ou https://, por exemplo http://172.16.52.30:11434.');
  end if;
  update public.settings set
    calendar_poll_enabled = coalesce((pl ->> 'calendar_poll_enabled')::boolean, calendar_poll_enabled),
    calendar_poll_minutes = coalesce((pl ->> 'calendar_poll_minutes')::int, calendar_poll_minutes),
    ai_proposal_enabled = coalesce((pl ->> 'ai_proposal_enabled')::boolean, ai_proposal_enabled),
    ai_classification_enabled = coalesce((pl ->> 'ai_classification_enabled')::boolean, ai_classification_enabled),
    ai_provider = coalesce(pl ->> 'ai_provider', ai_provider),
    ai_model = coalesce(pl ->> 'ai_model', ai_model),
    ai_local_url = case when pl ? 'ai_local_url' then nullif(btrim(pl ->> 'ai_local_url'), '') else ai_local_url end,
    ai_local_model = coalesce(nullif(btrim(pl ->> 'ai_local_model'), ''), ai_local_model),
    push_enabled_global = coalesce((pl ->> 'push_enabled_global')::boolean, push_enabled_global)
  where singleton
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;
