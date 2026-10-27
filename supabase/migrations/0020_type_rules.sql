-- Tipo pelo começo do título e pela série (1.1.0). "Reunião Mediadores POLI USP PRO" virou AULA MBA porque a
-- planilha antiga marcou esse título assim e o título igual do histórico decidia; 49 das 333 reuniões do
-- histórico estão como AULA MBA. Pedido do Raoni em 27/10/2026:
--   - palavra-chave de começo ("^reuniao"): vale só quando o título começa com ela e vem antes das outras
--     palavras-chave e do histórico; a mais longa ganha ("^reuniao mediadores" vence "^reuniao"). Espelha
--     classifyTitle do core. Só as regras claras do histórico entram aqui; o resto se edita no cadastro dos tipos;
--   - a série aprende: quando alguém corrige o tipo de um evento, a série dele (public.event_series, espelho de
--     eventSeries do core) guarda o tipo em public.series_rules, e os eventos de agora em diante da mesma série com
--     tipo automático mudam junto (type_source 'series');
--   - os eventos de agora em diante com tipo automático (palavra-chave, histórico ou IA) são refeitos pelas regras
--     de começo, e o histórico importado passa a ter o tipo das regras (corrige as reuniões marcadas como aula).
-- Tudo o que muda fica antes em public._backup_0020, para supabase/rollback/0020_down.sql.

alter table public.events drop constraint events_type_source_check;
alter table public.events add constraint events_type_source_check
  check (type_source in ('keyword', 'history', 'ai', 'admin', 'series'));

-- Palavras do texto sem acento e sem pontuação, como nameTokens do core.
create function public.name_tokens(s text) returns text[]
language sql immutable parallel safe set search_path = ''
as $$
  select coalesce(array_remove(regexp_split_to_array(public.norm_name(regexp_replace(public.norm_name(s), '[^a-z0-9 ]+', ' ', 'g')), ' '), ''), '{}')
$$;

-- Série do evento pelo título (eventSeries do core): a primeira linha sem números e sem as palavras que mudam de
-- semana para semana; um rótulo curto antes de ": " ("GRAVAÇÃO: ...") sai.
create function public.event_series(p_title text) returns text
language plpgsql immutable parallel safe set search_path = ''
as $$
declare
  v_first text := split_part(replace(coalesce(p_title, ''), E'\r', ''), E'\n', 1);
  v_body text := v_first;
  v_colon int := strpos(v_first, ': ');
  v_label text[];
begin
  if v_colon > 1 then
    v_label := public.name_tokens(left(v_first, v_colon - 1));
    if cardinality(v_label) between 1 and 2 then
      v_body := substr(v_first, v_colon + 2);
    end if;
  end if;
  return array_to_string(array(
    select t from unnest(public.name_tokens(v_body)) with ordinality as u (t, i)
    where t !~ '^[0-9]+$'
      and t <> all (array['aula', 'aulas', 'modulo', 'parte', 'encontro', 'turma', 'dia', 'semana', 'disciplina', 'professor', 'professora', 'prof', 'id'])
    order by i
  ), ' ');
end;
$$;

-- Tipo pela palavra-chave de começo ("^..."): a mais longa que abre o título; nulo sem nenhuma ou no empate.
create function public.prefix_type(p_title text) returns uuid
language sql stable security definer set search_path = ''
as $$
  with w as (select public.name_tokens(p_title) as words),
  m as (
    select t.id, cardinality(public.name_tokens(k)) as len
    from public.service_types t
    cross join lateral unnest(t.keywords) as k
    cross join w
    where t.archived_at is null and btrim(k) like '^%'
      and cardinality(public.name_tokens(k)) > 0
      and w.words[1:cardinality(public.name_tokens(k))] = public.name_tokens(k)
  ),
  top as (select max(len) as len from m)
  select case when count(distinct m.id) = 1 then (array_agg(m.id))[1] end
  from m join top on m.len = top.len
$$;

-- O que cada série aprendeu com quem monta a escala. Só administradores leem; escrita só pelas RPCs.
create table public.series_rules (
  id uuid primary key default gen_random_uuid(),
  series text not null unique check (series <> ''),
  -- Tipo da série, da última correção de tipo num evento dela.
  service_type_id uuid references public.service_types (id),
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create trigger row_meta before insert or update on public.series_rules for each row execute function public.tg_row_meta();
alter table public.series_rules enable row level security;
create policy admin_read on public.series_rules for select to authenticated using ((select public.is_admin()));
grant select on public.series_rules to authenticated;

-- Tipo do evento: nos de agora em diante da mesma série com tipo automático, igual à mudança de tipo do
-- administrador (vagas refeitas sem gente escalada; "equipe típica mudou" com gente).
create function public.retype_event(p_event uuid, p_type uuid, p_source text) returns void
language plpgsql security definer set search_path = ''
as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event for update;
  if not found or e.service_type_id is not distinct from p_type then
    return;
  end if;
  update public.events set service_type_id = p_type, type_source = p_source, type_certainty = 'alta' where id = p_event;
  if exists (select 1 from public.weeks w where w.week_start = e.week_start) and not public.is_week_past(e.week_start) then
    if public.event_has_people(e.id) then
      update public.events set crew_outdated = true where id = e.id;
    else
      perform public.rebuild_event_slots(e.id);
    end if;
    perform public.mark_week_dirty(e.week_start);
  end if;
end;
$$;

-- A correção do administrador ensina a série e vale para os eventos dela de agora em diante com tipo automático.
create function public.learn_series_type(p_event uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  e public.events;
  v_series text;
  o record;
begin
  select * into e from public.events where id = p_event;
  v_series := public.event_series(e.title);
  if e.service_type_id is null or v_series = '' then
    return;
  end if;
  insert into public.series_rules (series, service_type_id) values (v_series, e.service_type_id)
  on conflict (series) do update set service_type_id = excluded.service_type_id
  where public.series_rules.service_type_id is distinct from excluded.service_type_id;
  for o in
    select x.id from public.events x
    where x.id <> e.id and x.week_start >= public.monday_of(current_date)
      and x.status <> 'cancelled' and not x.ignored
      and coalesce(x.type_source, 'keyword') <> 'admin'
      and x.service_type_id is distinct from e.service_type_id
      and public.event_series(x.title) = v_series
  loop
    perform public.retype_event(o.id, e.service_type_id, 'series');
  end loop;
end;
$$;

-- Dados extras do evento. Igual à 0017, mais: a troca de tipo pelo administrador ensina a série.
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
  if v_type_changed and pl ->> 'service_type_id' is not null then
    perform public.learn_series_type(e.id);
  end if;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Dados. A cópia (public._backup_0020) fica fechada pela RLS, sem política: ninguém lê pela API.

create table public._backup_0020 (
  kind text not null,  -- service_type | event_type | history_type | event_outdated
  ref uuid not null,
  data jsonb,
  saved_at timestamptz not null default now()
);
alter table public._backup_0020 enable row level security;
revoke all on public._backup_0020 from anon, authenticated;

-- Regras de começo claras no histórico de out/2025 a out/2026 (tipo e palavras pelo norm_name). "Reunião" sozinha
-- vai para a REUNIAO INTERNA; as reuniões de setor têm o começo delas, mais longo. Tipo que não existe fica de fora.
do $$
declare
  r record;
begin
  create temporary table _rules_0020 (type_name text, keyword text) on commit drop;
  insert into _rules_0020 values
    ('reuniao interna', '^reuniao'),
    ('reuniao mediadores', '^reuniao mediadores'), ('reuniao mediadores', '^reuniao mediacao'),
    ('reuniao tecnica aulas', '^reuniao tecnica'),
    ('reuniao edicao', '^reuniao edicao'),
    ('reuniao producao', '^reuniao producao'),
    ('reuniao planejamento', '^reuniao planejamento'),
    ('aula mba', '^mba'), ('aula mba', '^faculdade'), ('aula mba', '^poli'), ('aula mba', '^especializacao'),
    ('aula mba', '^minicurso'),
    ('curso online', '^curso'), ('curso online', '^english'),
    ('webinar', '^webinar'),
    ('evento', '^evento'),
    ('edicao fotos', '^tratamento');

  insert into public._backup_0020 (kind, ref, data)
  select 'service_type', t.id, jsonb_build_object('keywords', to_jsonb(t.keywords))
  from public.service_types t
  where t.archived_at is null and public.norm_name(t.name) in (select type_name from _rules_0020);

  for r in
    select t.id, array_agg(x.keyword) as keywords
    from public.service_types t join _rules_0020 x on x.type_name = public.norm_name(t.name)
    where t.archived_at is null
    group by t.id
  loop
    update public.service_types
    set keywords = array(select distinct k from unnest(keywords || r.keywords) k)
    where id = r.id;
  end loop;
end;
$$;

-- Eventos de agora em diante com tipo automático: o tipo da regra de começo, quando há e é outro. Título com
-- asterisco ("*DISPONIBILIZAR") fica com o tipo do asterisco.
do $$
declare
  ev record;
begin
  for ev in
    select e.id, public.prefix_type(e.title) as new_type,
      jsonb_build_object('service_type_id', e.service_type_id, 'type_source', e.type_source, 'type_certainty', e.type_certainty) as old,
      e.crew_outdated
    from public.events e
    where e.week_start >= public.monday_of(current_date) and e.status <> 'cancelled'
      and coalesce(e.type_source, 'keyword') in ('keyword', 'history', 'ai')
      and btrim(e.title) !~ '^\*'
  loop
    if ev.new_type is null then
      continue;
    end if;
    if exists (select 1 from public.events x where x.id = ev.id and x.service_type_id is not distinct from ev.new_type) then
      continue;
    end if;
    insert into public._backup_0020 (kind, ref, data) values ('event_type', ev.id, ev.old);
    if not ev.crew_outdated then
      insert into public._backup_0020 (kind, ref) values ('event_outdated', ev.id);
    end if;
    perform public.retype_event(ev.id, ev.new_type, 'keyword');
  end loop;
end;
$$;

-- Histórico importado: o tipo da regra de começo, quando há e é outro.
with moved as (
  select h.id, h.service_type_id as old_type, public.prefix_type(h.title) as new_type
  from public.history_entries h
  where h.archived_at is null and btrim(h.title) !~ '^\*'
),
changed as (
  select * from moved where new_type is not null and new_type is distinct from old_type
),
saved as (
  insert into public._backup_0020 (kind, ref, data)
  select 'history_type', id, jsonb_build_object('service_type_id', old_type) from changed
)
update public.history_entries h set service_type_id = c.new_type
from changed c where h.id = c.id;
