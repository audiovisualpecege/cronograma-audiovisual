-- Ícone dos tipos de serviço, os tipos Férias e Folga, DISPONIBILIZAR sem equipe e o destaque dos eventos (1.1.0).
--
-- O ícone é a chave de um banco de ícones do app (apps/web/src/ui/typeIcons.ts); nulo deixa o app escolher um
-- pelo nome do tipo. Férias e Folga saem do "NAO ESCALAR", que fica para os horários reservados ("não marcar
-- nada", pré-reserva): os três não exigem equipe e o app os mostra à parte, no fim de cada dia.
-- "*DISPONIBILIZAR" é lembrete de uma tarefa importante, não pede ninguém escalado.
-- events.highlighted: a estrela de quem monta a escala nas atividades principais da semana; a forma de mostrar
-- no cronograma final ainda vai ser definida.

alter table public.events add column highlighted boolean not null default false;

alter table public.service_types add column icon text check (icon is null or icon ~ '^[a-z0-9-]{1,40}$');

create or replace function public.op_service_type_upsert(pl jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce((pl ->> 'id')::uuid, gen_random_uuid());
  v_name text := public.clean_name(pl ->> 'name');
  v_crew jsonb := coalesce(pl -> 'crew', '[]');
  v_no_team boolean := coalesce((pl ->> 'no_team')::boolean, false);
  v_icon text := nullif(btrim(coalesce(pl ->> 'icon', '')), '');
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
  if v_icon is not null and v_icon !~ '^[a-z0-9-]{1,40}$' then
    perform public.fail('invalid_icon', 'Ícone inválido.');
  end if;

  select true, public.crew_signature(t.id), t.no_team into v_existed, v_before, v_before_no_team
  from public.service_types t where t.id = v_id;

  insert into public.service_types (id, name, keywords, no_team, icon)
  values (
    v_id, v_name,
    array(select distinct btrim(k) from jsonb_array_elements_text(coalesce(pl -> 'keywords', '[]')) k where btrim(k) <> ''),
    v_no_team, v_icon
  )
  on conflict (id) do update set
    name = excluded.name, keywords = excluded.keywords, no_team = excluded.no_team,
    -- Pedido sem a chave "icon" (aparelho com a versão anterior) mantém o ícone gravado.
    icon = case when pl ? 'icon' then excluded.icon else public.service_types.icon end
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

-- Dados extras do evento, agora com o destaque (estrela). Igual à 0004, mais a chave "highlighted".
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
    period_end = case when pl ? 'period_end' then (pl ->> 'period_end')::timestamptz else period_end end,
    highlighted = case when pl ? 'highlighted' then coalesce((pl ->> 'highlighted')::boolean, false) else highlighted end
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

-- Férias e Folga, sem equipe. Só cria quando ainda não há tipo com o mesmo nome.
insert into public.service_types (name, keywords, no_team, icon)
select v.name, v.keywords, true, v.icon
from (values
  ('FERIAS', array['ferias'], 'ferias'),
  ('FOLGA', array['folga', 'folgas', 'day off'], 'folga')
) as v (name, keywords, icon)
where not exists (select 1 from public.service_types t where public.norm_name(t.name) = public.norm_name(v.name));

-- As palavras saem do NAO ESCALAR, senão o título empata entre dois tipos e fica sem tipo.
update public.service_types
set keywords = array(select k from unnest(keywords) k where k not in ('ferias', 'folga', 'folgas')), icon = coalesce(icon, 'reserva')
where public.norm_name(name) = 'nao escalar';

-- DISPONIBILIZAR vira lembrete sem equipe. apply_crew_change tira as vagas dos eventos ainda sem ninguém das
-- semanas montadas e marca "equipe típica mudou" nos que já têm gente, como a troca pelo cadastro faria.
do $$
declare t uuid;
begin
  for t in select id from public.service_types where public.norm_name(name) = 'disponibilizar' and not no_team loop
    update public.service_types set no_team = true, icon = coalesce(icon, 'enviar') where id = t;
    update public.service_type_crew set archived_at = now() where service_type_id = t and archived_at is null;
    perform public.apply_crew_change(t);
  end loop;
end;
$$;

-- Eventos de agora em diante que caíram no NAO ESCALAR por "férias" ou "folga" no título vão para o tipo novo.
update public.events e
set service_type_id = t.id, type_source = 'keyword', type_certainty = 'alta'
from public.service_types t, public.service_types n
where public.norm_name(n.name) = 'nao escalar' and e.service_type_id = n.id
  and e.week_start >= public.monday_of(current_date)
  and (
    (public.norm_name(t.name) = 'ferias' and public.norm_name(e.title) ~ '\mferias\M')
    or (public.norm_name(t.name) = 'folga' and public.norm_name(e.title) ~ '\mfolgas?\M' and public.norm_name(e.title) !~ '\mferias\M')
  );
