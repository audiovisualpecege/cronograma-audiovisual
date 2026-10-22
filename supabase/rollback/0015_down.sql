-- Desfaz a migração 0015_meetings_by_sector.sql com a cópia em public._backup_0015. Ver docs/publicar-1.1.0.md.
--   1. eventos que mudaram de tipo voltam para a REUNIAO INTERNA (ou o tipo que tinham);
--   2. REUNIAO INTERNA, REUNIAO TECNICA AULAS e REUNIAO MEDIADORES voltam ao que eram (palavras-chave, sem equipe
--      e equipe típica);
--   3. REUNIAO EDICAO, PRODUCAO e PLANEJAMENTO criados pela 0015 são apagados, ou arquivados se algo os usa;
--   4. as vagas dos eventos de reunião sem ninguém escalado são refeitas pela equipe antiga, e o aviso
--      "equipe típica mudou" que a 0015 pôs sai.
-- Depois de rodar: npx supabase migration repair --status reverted 0015

begin;

-- 1. Tipo dos eventos movidos.
update public.events e
set service_type_id = (b.data ->> 'service_type_id')::uuid,
    type_source = b.data ->> 'type_source',
    type_certainty = b.data ->> 'type_certainty'
from public._backup_0015 b
where b.kind = 'event_type' and e.id = b.ref;

-- 2. Tipos e equipe típica como eram.
update public.service_types t
set keywords = array(select jsonb_array_elements_text(b.data -> 'keywords')),
    no_team = (b.data ->> 'no_team')::boolean,
    icon = b.data ->> 'icon'
from public._backup_0015 b
where b.kind = 'service_type' and t.id = b.ref;

update public.service_type_crew c set archived_at = now()
where c.archived_at is null
  and c.service_type_id in (select ref from public._backup_0015 where kind = 'service_type');

update public.service_type_crew c
set archived_at = null, quantity = (b.data ->> 'quantity')::int
from public._backup_0015 b
where b.kind = 'crew' and c.service_type_id = b.ref and c.job_role_id = (b.data ->> 'job_role_id')::uuid;

-- 3. Tipos criados pela 0015.
delete from public.service_type_crew c using public._backup_0015 b
where b.kind = 'created_type' and c.service_type_id = b.ref
  and not exists (select 1 from public.events e where e.service_type_id = b.ref)
  and not exists (select 1 from public.history_entries h where h.service_type_id = b.ref);
delete from public.service_types t using public._backup_0015 b
where b.kind = 'created_type' and t.id = b.ref
  and not exists (select 1 from public.events e where e.service_type_id = t.id)
  and not exists (select 1 from public.history_entries h where h.service_type_id = t.id);
update public.service_types t set archived_at = coalesce(t.archived_at, now())
from public._backup_0015 b
where b.kind = 'created_type' and t.id = b.ref;

-- 4. Vagas dos eventos de reunião sem ninguém, pela equipe antiga; o aviso posto pela 0015 sai.
do $$
declare ev record;
begin
  for ev in
    select e.id, e.week_start from public.events e
    where e.service_type_id in (select ref from public._backup_0015 where kind in ('service_type', 'created_type'))
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
from public._backup_0015 b
where b.kind = 'event_outdated' and e.id = b.ref;

-- A cópia fica até alguém conferir; apague à mão depois: drop table public._backup_0015;

commit;
