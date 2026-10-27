-- Titular e reserva de cada série (1.1.0). Pedido do Raoni em 27/10/2026: a turma fixa vem do que o Planejamento faz;
-- quando a mesma troca se repete 2 semanas seguidas, o app pergunta "virou o titular?" e a resposta fica gravada.
--   - series_rules.titulars: { id da função: [titular, reserva] } (ids de pessoas). Sem resposta, a turma fixa
--     continua deduzida do histórico (quem mais fez a série nas 8 semanas antes);
--   - set_series_titular(série, função, pessoas): só administradores; o app chama com internet.
-- Não mexe em dados.

alter table public.series_rules add column titulars jsonb check (titulars is null or jsonb_typeof(titulars) = 'object');

create function public.set_series_titular(p_series text, p_role uuid, p_people uuid[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  -- Na ordem que veio: titular primeiro, reserva depois.
  v_people uuid[] := array(select x from unnest(coalesce(p_people, '{}')) with ordinality as u (x, i) where x is not null order by i);
  v_version int;
begin
  if not public.is_admin() then
    perform public.fail('forbidden', 'Só administradores mudam a turma fixa.');
  end if;
  if coalesce(btrim(p_series), '') = '' or not exists (select 1 from public.job_roles r where r.id = p_role) then
    perform public.fail('not_found', 'Série ou função não encontrada.');
  end if;
  if cardinality(v_people) > 2
     or cardinality(v_people) <> (select count(distinct x) from unnest(v_people) x)
     or exists (select 1 from unnest(v_people) x where not exists (select 1 from public.people p where p.id = x)) then
    perform public.fail('not_found', 'Escolha o titular e, se quiser, um reserva (pessoas diferentes).');
  end if;
  insert into public.series_rules (series, titulars) values (p_series, jsonb_build_object(p_role::text, to_jsonb(v_people)))
  on conflict (series) do update set titulars = coalesce(public.series_rules.titulars, '{}') || excluded.titulars
  returning version into v_version;
  return jsonb_build_object('status', 'applied', 'version', v_version);
end;
$$;

grant execute on function public.set_series_titular(text, uuid, uuid[]) to authenticated;
