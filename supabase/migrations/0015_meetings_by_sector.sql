-- Reuniões por setor (1.1.0). A REUNIAO INTERNA pedia a equipe inteira (47 vagas por reunião): numa semana eram
-- 329 das 685 vagas, inclusive em reuniões de um setor só ("Reunião Semanal Edição", "Reunião Produção"), e a
-- proposta da IA falhava no primeiro lote. Agora:
--   - REUNIAO EDICAO, REUNIAO PRODUCAO e REUNIAO PLANEJAMENTO (novas), REUNIAO TECNICA AULAS e REUNIAO MEDIADORES
--     pedem uma vaga por pessoa ativa do setor, na função dela daquele setor (a de menor código, se tiver mais);
--   - REUNIAO INTERNA (as reuniões que não são de um setor) não pede equipe: só marca o horário;
--   - eventos de agora em diante voltam a ser classificados entre as reuniões pelo título, e as vagas das
--     semanas montadas são refeitas onde ninguém foi escalado ("equipe típica mudou" onde já tem gente).
-- A equipe de cada reunião é a do dia da migração: quem entrar depois no setor é somado no cadastro do tipo.
-- Tudo o que muda fica antes em public._backup_0015, para supabase/rollback/0015_down.sql.

create table public._backup_0015 (
  kind text not null,  -- service_type | crew | created_type | event_type | event_outdated
  ref uuid not null,
  data jsonb,
  saved_at timestamptz not null default now()
);
alter table public._backup_0015 enable row level security;
revoke all on public._backup_0015 from anon, authenticated;

-- Cópia do que vai mudar: os tipos de reunião que já existem e a equipe típica deles.
insert into public._backup_0015 (kind, ref, data)
select 'service_type', t.id, to_jsonb(t) from public.service_types t
where public.norm_name(t.name) in ('reuniao interna', 'reuniao tecnica aulas', 'reuniao mediadores');

insert into public._backup_0015 (kind, ref, data)
select 'crew', c.service_type_id, to_jsonb(c) from public.service_type_crew c
join public.service_types t on t.id = c.service_type_id
where public.norm_name(t.name) in ('reuniao interna', 'reuniao tecnica aulas', 'reuniao mediadores') and c.archived_at is null;

-- Tipos novos de reunião por setor.
with created as (
  insert into public.service_types (name, keywords, no_team, icon)
  select v.name, v.keywords, false, 'reuniao'
  from (values
    ('REUNIAO EDICAO', array['reuniao edicao', 'reuniao de edicao', 'reuniao semanal edicao']),
    ('REUNIAO PRODUCAO', array['reuniao producao', 'reuniao de producao', 'reuniao semanal producao']),
    ('REUNIAO PLANEJAMENTO', array['reuniao planejamento', 'reuniao de planejamento'])
  ) as v (name, keywords)
  where not exists (select 1 from public.service_types t where public.norm_name(t.name) = public.norm_name(v.name))
  returning id
)
insert into public._backup_0015 (kind, ref) select 'created_type', id from created;

-- "Reunião Equipe Técnica" também é da Técnica.
update public.service_types
set keywords = array(select distinct k from unnest(keywords || array['reuniao equipe tecnica', 'reuniao tecnica aulas']) k)
where public.norm_name(name) = 'reuniao tecnica aulas';

-- Equipe de cada reunião de setor: uma vaga por pessoa ativa do setor (tipo e setor pelo norm_name).
do $$
declare
  m record;
  v_type uuid;
  v_n int;
begin
  for m in
    select * from (values
      ('reuniao edicao', 'edicao'),
      ('reuniao producao', 'producao'),
      ('reuniao planejamento', 'planejamento'),
      ('reuniao tecnica aulas', 'tecnica'),
      ('reuniao mediadores', 'mediacao')
    ) as v (type_name, sector)
  loop
    select t.id into v_type from public.service_types t where public.norm_name(t.name) = m.type_name;
    if v_type is null then
      continue;
    end if;
    update public.service_type_crew set archived_at = now() where service_type_id = v_type and archived_at is null;
    with per_person as (
      select pr.person_id, min(r.code) as code
      from public.person_roles pr
      join public.people p on p.id = pr.person_id and p.active
      join public.job_roles r on r.id = pr.job_role_id and r.archived_at is null
      join public.sectors s on s.id = r.sector_id and public.norm_name(s.name) = m.sector
      where pr.archived_at is null
      group by pr.person_id
    ),
    per_role as (
      select r.id as job_role_id, least(count(*), 30)::int as quantity
      from per_person pp join public.job_roles r on r.code = pp.code
      group by r.id
    )
    insert into public.service_type_crew (service_type_id, job_role_id, quantity)
    select v_type, job_role_id, quantity from per_role
    on conflict (service_type_id, job_role_id) do update set quantity = excluded.quantity, archived_at = null;
    get diagnostics v_n = row_count;
    -- Setor sem ninguém: a reunião fica sem equipe em vez de sem vagas e "exige equipe".
    update public.service_types set no_team = (v_n = 0), icon = coalesce(icon, 'reuniao') where id = v_type;
  end loop;
end;
$$;

-- REUNIAO INTERNA só marca o horário.
update public.service_types set no_team = true, icon = coalesce(icon, 'reuniao') where public.norm_name(name) = 'reuniao interna';
update public.service_type_crew c set archived_at = now()
from public.service_types t
where t.id = c.service_type_id and public.norm_name(t.name) = 'reuniao interna' and c.archived_at is null;

-- Reuniões de agora em diante que caíram na REUNIAO INTERNA vão para a do setor, pelo título.
with target as (
  select e.id, e.service_type_id as old_type, e.type_source, e.type_certainty,
    case
      when public.norm_name(e.title) ~ '\mreuniao( semanal| de)? edicao\M' then 'reuniao edicao'
      when public.norm_name(e.title) ~ '\mreuniao( semanal| de)? producao\M' then 'reuniao producao'
      when public.norm_name(e.title) ~ '\mreuniao( de)? planejamento\M' then 'reuniao planejamento'
      when public.norm_name(e.title) ~ '\mreuniao( equipe)? tecnica\M' then 'reuniao tecnica aulas'
    end as new_name
  from public.events e
  join public.service_types i on i.id = e.service_type_id and public.norm_name(i.name) = 'reuniao interna'
  where e.week_start >= public.monday_of(current_date) and e.status <> 'cancelled'
),
moved as (
  select t.*, s.id as new_type from target t join public.service_types s on public.norm_name(s.name) = t.new_name
),
saved as (
  insert into public._backup_0015 (kind, ref, data)
  select 'event_type', id, jsonb_build_object('service_type_id', old_type, 'type_source', type_source, 'type_certainty', type_certainty)
  from moved
)
update public.events e set service_type_id = m.new_type, type_source = 'keyword', type_certainty = 'alta'
from moved m where e.id = m.id;

-- Vagas das semanas montadas, de agora em diante, nos eventos de reunião: refeitas onde ninguém foi escalado;
-- com gente, ficam como estão e ganham "equipe típica mudou".
do $$
declare ev record;
begin
  for ev in
    select e.id, e.week_start, public.event_has_people(e.id) as has_people
    from public.events e
    join public.service_types t on t.id = e.service_type_id
    where public.norm_name(t.name) in ('reuniao interna', 'reuniao edicao', 'reuniao producao', 'reuniao planejamento', 'reuniao tecnica aulas', 'reuniao mediadores')
      and e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start)
      and exists (select 1 from public.weeks w where w.week_start = e.week_start)
  loop
    if ev.has_people then
      insert into public._backup_0015 (kind, ref) select 'event_outdated', ev.id
      from public.events x where x.id = ev.id and not x.crew_outdated;
      update public.events set crew_outdated = true where id = ev.id;
    else
      perform public.rebuild_event_slots(ev.id);
    end if;
    perform public.mark_week_dirty(ev.week_start);
  end loop;
end;
$$;
