-- Desfaz a migração 0014_local_ai.sql: volta op_settings_update como na 0004 e tira as colunas da IA local.
-- Se o fornecedor estava no local, volta para o Gemini. Ver docs/publicar-1.1.0.md.
-- Depois de rodar: npx supabase migration repair --status reverted 0014

begin;

update public.settings set ai_provider = 'gemini' where ai_provider = 'local';

create or replace function public.op_settings_update(pl jsonb) returns jsonb
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

alter table public.settings drop column ai_local_url, drop column ai_local_model;

commit;
