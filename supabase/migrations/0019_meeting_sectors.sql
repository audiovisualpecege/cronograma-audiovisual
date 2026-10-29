-- Reuniões sem escala, ligadas aos setores (1.1.0). Pedido do Raoni em 26/10/2026: reunião não se escala;
-- basta saber de que setor ela é, para quem é do setor ver na própria agenda.
--   - service_types.sector_ids: os setores que veem os eventos do tipo na agenda da equipe. Vale para tipo que
--     não exige equipe (reuniões); tipo com equipe continua aparecendo para quem está escalado;
--   - a equipe passa a ler os tipos de serviço (nome, ícone, setores), e os eventos de tipo sem equipe ligado ao
--     setor da pessoa, nas semanas publicadas;
--   - service_type.upsert recebe "sector_ids" (sem a chave, mantém o gravado): a função da 0017 vira
--     op_service_type_upsert_base e a nova grava os setores depois dela.
-- Dados: REUNIAO EDICAO, PRODUCAO, PLANEJAMENTO, TECNICA AULAS e MEDIADORES deixam de pedir equipe (as vagas
-- vazias somem das semanas montadas; com gente, ficam com "equipe típica mudou") e ficam ligadas ao setor de cada
-- uma. REUNIAO INTERNA fica ligada a todos os setores (escolha do Raoni): toda a equipe vê.
-- Tudo o que muda fica antes em public._backup_0019, para supabase/rollback/0019_down.sql.

alter table public.service_types add column sector_ids uuid[] not null default '{}';

alter function public.op_service_type_upsert(jsonb) rename to op_service_type_upsert_base;

create function public.op_service_type_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_sectors uuid[];
  v_result jsonb;
  v_version int;
begin
  if pl ? 'sector_ids' then
    v_sectors := array(select distinct s::uuid from jsonb_array_elements_text(coalesce(pl -> 'sector_ids', '[]')) s);
    if exists (select 1 from unnest(v_sectors) s where not exists (select 1 from public.sectors x where x.id = s)) then
      perform public.fail('invalid_sector', 'Setor não encontrado.');
    end if;
  end if;
  v_result := public.op_service_type_upsert_base(pl);
  if pl ? 'sector_ids' then
    update public.service_types set sector_ids = v_sectors
    where id = (v_result ->> 'id')::uuid and sector_ids is distinct from v_sectors
    returning version into v_version;
    if v_version is not null then
      v_result := v_result || jsonb_build_object('version', v_version);
    end if;
  end if;
  return v_result;
end;
$$;

-- Evento de tipo sem equipe ligado ao setor da pessoa da sessão (reunião do setor).
create function public.meeting_for_me(type_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.service_types t join public.people p on p.id = public.current_person()
    where t.id = type_id and t.no_team and p.sector_id is not null and p.sector_id = any (t.sector_ids)
  )
$$;

-- A equipe lê os tipos (para o nome, o ícone e os setores das reuniões).
create policy active_read on public.service_types for select to authenticated
  using ((select public.current_person()) is not null);

-- Eventos de semanas publicadas que exigem equipe, como antes, mais as reuniões do setor da pessoa.
drop policy team_read on public.events;
create policy team_read on public.events for select to authenticated
  using (
    (select public.current_person()) is not null
    and public.week_is_published(week_start)
    and not ignored
    and (
      (not no_team and not public.service_type_no_team(service_type_id))
      or public.meeting_for_me(service_type_id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Dados. A cópia (public._backup_0019) fica fechada pela RLS, sem política: ninguém lê pela API.

create table public._backup_0019 (
  kind text not null,  -- service_type | crew | event_outdated
  ref uuid not null,
  data jsonb,
  saved_at timestamptz not null default now()
);
alter table public._backup_0019 enable row level security;
revoke all on public._backup_0019 from anon, authenticated;

do $$
declare
  m record;
  v_type uuid;
  v_sector uuid;
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
    select t.id into v_type from public.service_types t where public.norm_name(t.name) = m.type_name and t.archived_at is null;
    if v_type is null then
      continue;
    end if;
    select s.id into v_sector from public.sectors s where public.norm_name(s.name) = m.sector and s.archived_at is null;

    insert into public._backup_0019 (kind, ref, data) select 'service_type', t.id, to_jsonb(t) from public.service_types t where t.id = v_type;
    insert into public._backup_0019 (kind, ref, data)
    select 'crew', c.service_type_id, to_jsonb(c) from public.service_type_crew c where c.service_type_id = v_type and c.archived_at is null;
    insert into public._backup_0019 (kind, ref)
    select 'event_outdated', e.id from public.events e
    where e.service_type_id = v_type and not e.crew_outdated and public.event_has_people(e.id)
      and e.status <> 'cancelled' and not e.ignored
      and not public.is_week_past(e.week_start) and exists (select 1 from public.weeks w where w.week_start = e.week_start);

    update public.service_types
    set no_team = true, sector_ids = case when v_sector is null then '{}' else array[v_sector] end
    where id = v_type;
    update public.service_type_crew set archived_at = now() where service_type_id = v_type and archived_at is null;
    perform public.apply_crew_change(v_type);
  end loop;
end;
$$;

-- REUNIAO INTERNA (já sem equipe desde a 0015): toda a equipe vê, ligada a todos os setores ativos de hoje.
-- Setor criado depois entra marcando na tela.
insert into public._backup_0019 (kind, ref, data)
select 'service_type', t.id, to_jsonb(t) from public.service_types t
where public.norm_name(t.name) = 'reuniao interna' and t.archived_at is null;

update public.service_types
set no_team = true, sector_ids = array(select s.id from public.sectors s where s.archived_at is null order by s.name)
where public.norm_name(name) = 'reuniao interna' and archived_at is null;
