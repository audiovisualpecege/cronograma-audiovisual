-- Desfaz a migração 0013_type_icon_and_highlight.sql. Rodar só se for desfazer a 1.1.0; ver
-- docs/publicar-1.1.0.md. Usa a cópia que a 0013 guardou em public._backup_0013 para voltar os dados:
--   1. eventos que foram de NAO ESCALAR para FERIAS ou FOLGA voltam ao tipo antigo;
--   2. NAO ESCALAR e DISPONIBILIZAR voltam ao que eram (palavras-chave, sem equipe, ícone) e a equipe
--      típica do DISPONIBILIZAR volta; as vagas dos eventos sem ninguém voltam, e quem ganhou o aviso
--      "equipe típica mudou" pela 0013 perde o aviso;
--   3. FERIAS e FOLGA criados pela 0013 são apagados (só se nenhum evento ou histórico os usa);
--   4. as funções voltam como na 0004 e as colunas icon e highlighted saem.
-- Destaques (estrela) e ícones escolhidos depois da 0013 se perdem: é o que a versão anterior não guarda.
-- Depois de rodar: npx supabase migration repair --status reverted 0013

begin;

-- 1. Tipo dos eventos movidos.
update public.events e
set service_type_id = (b.data ->> 'service_type_id')::uuid,
    type_source = b.data ->> 'type_source',
    type_certainty = b.data ->> 'type_certainty'
from public._backup_0013 b
where b.kind = 'event_type' and e.id = b.ref;

-- 2. NAO ESCALAR e DISPONIBILIZAR como eram.
update public.service_types t
set keywords = array(select jsonb_array_elements_text(b.data -> 'keywords')),
    no_team = (b.data ->> 'no_team')::boolean
from public._backup_0013 b
where b.kind = 'service_type' and t.id = b.ref;

update public.service_type_crew c
set archived_at = null, quantity = (b.data ->> 'quantity')::int
from public._backup_0013 b
where b.kind = 'crew' and c.service_type_id = b.ref and c.job_role_id = (b.data ->> 'job_role_id')::uuid;

do $$
declare t uuid;
begin
  for t in select distinct ref from public._backup_0013 where kind = 'crew' loop
    perform public.apply_crew_change(t);
  end loop;
end;
$$;

update public.events e set crew_outdated = false
from public._backup_0013 b
where b.kind = 'event_outdated' and e.id = b.ref;

-- 3. Tipos criados pela 0013, se ninguém os usa.
delete from public.service_types t
using public._backup_0013 b
where b.kind = 'created_type' and t.id = b.ref
  and not exists (select 1 from public.events e where e.service_type_id = t.id)
  and not exists (select 1 from public.history_entries h where h.service_type_id = t.id);
update public.service_types t set archived_at = coalesce(t.archived_at, now())
from public._backup_0013 b
where b.kind = 'created_type' and t.id = b.ref;

-- 4. Funções como na 0004 e colunas fora.
create or replace function public.op_service_type_upsert(pl jsonb) returns jsonb
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

create or replace function public.op_event_update_extras(pl jsonb, p_base int) returns jsonb
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

alter table public.events drop column highlighted;
alter table public.service_types drop column icon;

-- A cópia fica até alguém conferir que voltou tudo; apague à mão depois: drop table public._backup_0013;

commit;
