-- Desfaz a migração 0020_type_rules.sql com a cópia em public._backup_0020. Ver docs/publicar-1.1.0.md.
--   1. op_event_update_extras volta ao da 0017 (a troca de tipo deixa de ensinar a série);
--   2. o histórico importado e os eventos que mudaram de tipo voltam ao tipo que tinham, e os eventos que a série
--      mudou depois (type_source 'series') voltam a "a definir" para a identificação refazer;
--   3. os tipos voltam às palavras-chave de antes; saem series_rules e as funções novas;
--   4. as vagas dos eventos que voltaram de tipo, sem ninguém escalado, são refeitas.
-- Depois de rodar: npx supabase migration repair --status reverted 0020

begin;

-- 1. Dados extras do evento como na 0017.
create or replace function public.op_event_update_extras(pl jsonb, p_base int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_type_changed boolean;
  v_team_changed boolean;
  v_size_changed boolean;
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
  if pl ? 'size' and pl ->> 'size' is not null and (pl ->> 'size') !~ '^[1-3]$' then
    perform public.fail('invalid_size', 'O porte vai de 1 (Simples) a 3 (Grande).');
  end if;
  v_type_changed := pl ? 'service_type_id' and (pl ->> 'service_type_id')::uuid is distinct from e.service_type_id;
  v_team_changed := pl ? 'no_team' and (pl ->> 'no_team')::boolean is distinct from e.no_team;
  v_size_changed := pl ? 'size' and (pl ->> 'size')::smallint is distinct from e.size;
  v_built := exists (select 1 from public.weeks w where w.week_start = e.week_start);
  v_people := public.event_has_people(e.id);
  if (v_type_changed or v_team_changed or v_size_changed) and v_built and v_people and v_mode is null then
    perform public.fail('mode_required', 'O evento já tem pessoas escaladas: escolha manter as vagas ou refazê-las.');
  end if;

  update public.events set
    service_type_id = case when pl ? 'service_type_id' then (pl ->> 'service_type_id')::uuid else service_type_id end,
    type_certainty = case when v_type_changed then case when pl ->> 'service_type_id' is null then 'baixa' else 'alta' end else type_certainty end,
    type_source = case when v_type_changed then 'admin' else type_source end,
    no_team = case when pl ? 'no_team' then (pl ->> 'no_team')::boolean else no_team end,
    size = case when pl ? 'size' then (pl ->> 'size')::smallint else size end,
    notes = case when pl ? 'notes' then pl ->> 'notes' else notes end,
    period_start = case when pl ? 'period_start' then (pl ->> 'period_start')::timestamptz else period_start end,
    period_end = case when pl ? 'period_end' then (pl ->> 'period_end')::timestamptz else period_end end,
    highlighted = case when pl ? 'highlighted' then coalesce((pl ->> 'highlighted')::boolean, false) else highlighted end
  where id = e.id
  returning version into v_version;

  if (v_type_changed or v_team_changed or v_size_changed) and v_built and (not v_people or v_mode = 'rebuild') then
    perform public.rebuild_event_slots(e.id);
    select version into v_version from public.events where id = e.id;
  end if;
  if v_built then
    perform public.mark_week_dirty(e.week_start);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- 2. Tipos de volta.
update public.history_entries h set service_type_id = (b.data ->> 'service_type_id')::uuid
from public._backup_0020 b
where b.kind = 'history_type' and h.id = b.ref;

create temporary table _back_0020 (id uuid primary key) on commit drop;

insert into _back_0020
select e.id from public.events e
join public._backup_0020 b on b.kind = 'event_type' and b.ref = e.id;

update public.events e
set service_type_id = (b.data ->> 'service_type_id')::uuid,
    type_source = b.data ->> 'type_source',
    type_certainty = b.data ->> 'type_certainty'
from public._backup_0020 b
where b.kind = 'event_type' and e.id = b.ref;

insert into _back_0020
select e.id from public.events e where e.type_source = 'series'
on conflict do nothing;

update public.events set service_type_id = null, type_source = null, type_certainty = 'baixa'
where type_source = 'series';

alter table public.events drop constraint events_type_source_check;
alter table public.events add constraint events_type_source_check
  check (type_source in ('keyword', 'history', 'ai', 'admin'));

-- 3. Palavras-chave e o que a 0020 criou.
update public.service_types t
set keywords = array(select jsonb_array_elements_text(b.data -> 'keywords'))
from public._backup_0020 b
where b.kind = 'service_type' and t.id = b.ref;

drop function public.learn_series_type(uuid);
drop function public.retype_event(uuid, uuid, text);
drop function public.prefix_type(text);
drop table public.series_rules;
drop function public.event_series(text);
drop function public.name_tokens(text);

-- 4. Vagas dos eventos que voltaram de tipo.
do $$
declare ev record;
begin
  for ev in
    select e.id, e.week_start from public.events e join _back_0020 x on x.id = e.id
    where e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start)
      and exists (select 1 from public.weeks w where w.week_start = e.week_start)
      and not public.event_has_people(e.id)
  loop
    perform public.rebuild_event_slots(ev.id);
    perform public.mark_week_dirty(ev.week_start);
  end loop;
end;
$$;

update public.events e set crew_outdated = false
from public._backup_0020 b
where b.kind = 'event_outdated' and e.id = b.ref;

-- A cópia fica até alguém conferir; apague à mão depois: drop table public._backup_0020;

commit;
