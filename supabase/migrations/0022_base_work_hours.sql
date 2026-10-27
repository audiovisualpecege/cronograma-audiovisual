-- Sede e horário de trabalho (1.1.0). Pedido do Raoni em 27/10/2026: a equipe de São Paulo faz aulas, MBA, cursos e
-- as gravações do estúdio de lá, mas não faz externa; a de Piracicaba faz tudo e viaja quando precisa. Cada sede tem
-- as suas aulas (a sede da série o app aprende de quem costuma fazer). Fora do horário a pessoa ainda pode ser
-- escalada, com o aviso.
--   - people.base ('piracicaba' ou 'sao_paulo') e people.work_hours ({"1": ["08:00", "17:00"], ...}, dia da semana
--     ISO; dia sem chave é dia de não trabalhar); person.upsert grava os dois quando o aparelho manda a chave;
--   - service_types.external: tipo externo, só de Piracicaba; service_type.upsert grava quando vem a chave;
--   - check_eligibility ganha os alertas off_hours (fora do horário) e other_base (pessoa de São Paulo em tipo
--     externo). Espelha checkEligibility do core; a sede da série fica só no app, que a aprende do histórico.
-- Dados: EVENTO, FOTOS e GRAVACAO EXTERNA ficam externos (dá para mudar no cadastro dos tipos).
-- Tudo o que muda fica antes em public._backup_0022, para supabase/rollback/0022_down.sql.

alter table public.people
  add column base text check (base is null or base in ('piracicaba', 'sao_paulo')),
  add column work_hours jsonb check (work_hours is null or jsonb_typeof(work_hours) = 'object');

alter table public.service_types add column external boolean not null default false;

-- O evento sai do horário de trabalho: em algum dia dele a pessoa não trabalha, ou o trecho do dia começa antes da
-- entrada ou acaba depois da saída (horário de Brasília). Espelha outsideWorkHours do core.
create function public.outside_work_hours(p_hours jsonb, p_start timestamptz, p_end timestamptz) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  d date;
  w jsonb;
  v_from timestamptz;
  v_to timestamptz;
begin
  for d in
    select g::date from generate_series(
      (p_start at time zone 'America/Sao_Paulo')::date,
      (greatest(p_start, p_end - interval '1 microsecond') at time zone 'America/Sao_Paulo')::date,
      interval '1 day'
    ) g
  loop
    w := p_hours -> extract(isodow from d)::int::text;
    if w is null or jsonb_typeof(w) <> 'array' then
      return true;
    end if;
    v_from := greatest(p_start, d::timestamp at time zone 'America/Sao_Paulo');
    v_to := least(p_end, (d + 1)::timestamp at time zone 'America/Sao_Paulo');
    if v_from < (d + (w ->> 0)::time) at time zone 'America/Sao_Paulo'
       or v_to > (d + (w ->> 1)::time) at time zone 'America/Sao_Paulo' then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.warning_label(code text) returns text
language sql immutable set search_path = ''
as $$
  select case code
    when 'overlap' then 'horário sobreposto'
    when 'absent' then 'pessoa ausente'
    when 'over_limit' then 'passa do limite semanal'
    when 'role_not_enabled' then 'função não habilitada'
    when 'off_hours' then 'fora do horário de trabalho'
    when 'other_base' then 'outra sede'
    else code
  end
$$;

-- Igual à 0018, mais: fora do horário de trabalho e outra sede (tipo externo é só de Piracicaba).
create or replace function public.check_eligibility(p_person uuid, p_slot uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  p public.people;
  s public.slots;
  e public.events;
  busy tstzrange;
  load numeric;
  free boolean;
  blockers text[] := '{}';
  warnings text[] := '{}';
begin
  select * into p from public.people where id = p_person;
  if not found then
    perform public.fail('not_found', 'Pessoa não encontrada.');
  end if;
  select * into s from public.slots where id = p_slot;
  if not found then
    perform public.fail('not_found', 'Vaga não encontrada.');
  end if;
  select * into e from public.events where id = s.event_id;
  free := public.slot_no_hours(p_slot);

  if not p.active then blockers := array_append(blockers, 'person_inactive'); end if;
  if e.status = 'cancelled' then blockers := array_append(blockers, 'event_cancelled'); end if;
  if exists (
    select 1 from public.assignments a
    where a.person_id = p_person and a.event_id = e.id and a.slot_id <> p_slot
  ) then
    blockers := array_append(blockers, 'same_event_twice');
  end if;
  if public.is_week_past(e.week_start) then blockers := array_append(blockers, 'week_past'); end if;

  busy := public.event_busy(e);
  if not free and exists (
    select 1 from public.assignments a join public.events o on o.id = a.event_id
    where a.person_id = p_person and a.slot_id <> p_slot and o.id <> e.id and o.status <> 'cancelled'
      and not public.slot_no_hours(a.slot_id)
      and public.event_busy(o) && busy
  ) then
    warnings := array_append(warnings, 'overlap');
  end if;

  if exists (
    select 1 from public.absences ab
    where ab.person_id = p_person and ab.archived_at is null
      and tstzrange(ab.starts_at, ab.ends_at, '[)') && busy
  ) then
    warnings := array_append(warnings, 'absent');
  end if;

  -- Carga da semana do evento sem esta vaga; cada evento conta uma vez; vaga que não ocupa horário não soma.
  select coalesce(sum(public.event_hours(o)), 0) into load
  from public.events o
  where o.week_start = e.week_start and o.status <> 'cancelled'
    and exists (
      select 1 from public.assignments a
      where a.event_id = o.id and a.person_id = p_person and a.slot_id <> p_slot
        and not public.slot_no_hours(a.slot_id)
    );
  if load + case when free then 0 else public.event_hours(e) end > p.weekly_limit_hours then
    warnings := array_append(warnings, 'over_limit');
  end if;

  if not exists (
    select 1 from public.person_roles pr
    where pr.person_id = p_person and pr.job_role_id = s.job_role_id and pr.archived_at is null
  ) then
    warnings := array_append(warnings, 'role_not_enabled');
  end if;

  -- Dia inteiro sem período não tem horário; com período, vale o período.
  if not free and p.work_hours is not null and (not e.all_day or (e.period_start is not null and e.period_end is not null))
     and public.outside_work_hours(
       p.work_hours,
       case when e.all_day then e.period_start else e.starts_at end,
       case when e.all_day then e.period_end else e.ends_at end
     ) then
    warnings := array_append(warnings, 'off_hours');
  end if;

  if p.base is not null and p.base <> 'piracicaba'
     and exists (select 1 from public.service_types t where t.id = e.service_type_id and t.external) then
    warnings := array_append(warnings, 'other_base');
  end if;

  return jsonb_build_object(
    'ok', cardinality(blockers) = 0 and cardinality(warnings) = 0,
    'blockers', to_jsonb(blockers),
    'warnings', to_jsonb(warnings)
  );
end;
$$;

-- Pessoa: a função da 0016 vira op_person_upsert_base; a nova grava sede e horário depois dela.
alter function public.op_person_upsert(jsonb, uuid) rename to op_person_upsert_base;

create function public.op_person_upsert(pl jsonb, me uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_hours jsonb := pl -> 'work_hours';
  v_result jsonb;
  v_version int;
begin
  if pl ? 'base' and pl ->> 'base' is not null and pl ->> 'base' not in ('piracicaba', 'sao_paulo') then
    perform public.fail('invalid_base', 'A sede é Piracicaba ou São Paulo.');
  end if;
  if pl ? 'work_hours' and v_hours is not null and jsonb_typeof(v_hours) <> 'null' then
    if jsonb_typeof(v_hours) <> 'object' or exists (
      select 1 from jsonb_each(v_hours) d
      where d.key !~ '^[1-7]$' or jsonb_typeof(d.value) <> 'array' or jsonb_array_length(d.value) <> 2
        or (d.value ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (d.value ->> 1) !~ '^([01][0-9]|2[0-4]):[0-5][0-9]$'
        or (d.value ->> 0) >= (d.value ->> 1)
    ) then
      perform public.fail('invalid_work_hours', 'Horário inválido: em cada dia, a entrada vem antes da saída (HH:MM).');
    end if;
  else
    v_hours := null;
  end if;
  v_result := public.op_person_upsert_base(pl, me);
  if pl ? 'base' or pl ? 'work_hours' then
    update public.people set
      base = case when pl ? 'base' then pl ->> 'base' else base end,
      work_hours = case when pl ? 'work_hours' then v_hours else work_hours end
    where id = (v_result ->> 'id')::uuid
      and (base is distinct from case when pl ? 'base' then pl ->> 'base' else base end
        or work_hours is distinct from case when pl ? 'work_hours' then v_hours else work_hours end)
    returning version into v_version;
    if v_version is not null then
      v_result := v_result || jsonb_build_object('version', v_version);
    end if;
  end if;
  return v_result;
end;
$$;

-- Tipo: a função da 0019 vira op_service_type_upsert_sectors; a nova grava "externo" depois dela.
alter function public.op_service_type_upsert(jsonb) rename to op_service_type_upsert_sectors;

create function public.op_service_type_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_version int;
begin
  v_result := public.op_service_type_upsert_sectors(pl);
  if pl ? 'external' then
    update public.service_types set external = coalesce((pl ->> 'external')::boolean, false)
    where id = (v_result ->> 'id')::uuid and external is distinct from coalesce((pl ->> 'external')::boolean, false)
    returning version into v_version;
    if v_version is not null then
      v_result := v_result || jsonb_build_object('version', v_version);
    end if;
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Dados. A cópia (public._backup_0022) fica fechada pela RLS, sem política: ninguém lê pela API.

create table public._backup_0022 (
  kind text not null,  -- external_type
  ref uuid not null,
  data jsonb,
  saved_at timestamptz not null default now()
);
alter table public._backup_0022 enable row level security;
revoke all on public._backup_0022 from anon, authenticated;

with marked as (
  update public.service_types set external = true
  where archived_at is null and public.norm_name(name) in ('evento', 'fotos', 'gravacao externa')
  returning id
)
insert into public._backup_0022 (kind, ref) select 'external_type', id from marked;
