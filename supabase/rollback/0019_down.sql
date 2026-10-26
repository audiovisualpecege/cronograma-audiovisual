-- Desfaz a migração 0019_meeting_sectors.sql com a cópia em public._backup_0019. Ver docs/publicar-1.1.0.md.
-- Rode antes do 0018_down.sql e do 0017_down.sql.
--   1. a equipe deixa de ler os tipos e as reuniões do setor (políticas como na 0002);
--   2. service_type.upsert volta a ser a função da 0017;
--   3. as reuniões de setor voltam a pedir a equipe de antes, com as vagas refeitas onde ninguém foi escalado;
--   4. sai a coluna sector_ids.
-- Depois de rodar: npx supabase migration repair --status reverted 0019

begin;

-- 1. Leitura da equipe.
drop policy active_read on public.service_types;
drop policy team_read on public.events;
create policy team_read on public.events for select to authenticated
  using (
    (select public.current_person()) is not null
    and public.week_is_published(week_start)
    and not no_team
    and not ignored
    and not public.service_type_no_team(service_type_id)
  );
drop function public.meeting_for_me(uuid);

-- 2. Função de gravar o tipo.
drop function public.op_service_type_upsert(jsonb);
alter function public.op_service_type_upsert_base(jsonb) rename to op_service_type_upsert;

-- 3. Reuniões como eram.
update public.service_types t set no_team = (b.data ->> 'no_team')::boolean
from public._backup_0019 b
where b.kind = 'service_type' and t.id = b.ref;

update public.service_type_crew c set archived_at = now()
where c.archived_at is null and c.service_type_id in (select ref from public._backup_0019 where kind = 'service_type');

update public.service_type_crew c
set archived_at = null, quantity = (b.data ->> 'quantity')::int
from public._backup_0019 b
where b.kind = 'crew' and c.id = (b.data ->> 'id')::uuid;

do $$
declare ev record;
begin
  for ev in
    select e.id, e.week_start from public.events e
    where e.service_type_id in (select ref from public._backup_0019 where kind = 'service_type')
      and e.status <> 'cancelled' and not e.ignored
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
from public._backup_0019 b
where b.kind = 'event_outdated' and e.id = b.ref;

-- 4. Coluna.
alter table public.service_types drop column sector_ids;

-- A cópia fica até alguém conferir; apague à mão depois: drop table public._backup_0019;

commit;
