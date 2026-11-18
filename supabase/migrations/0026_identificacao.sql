-- Identificação (1.2.0). Pedidos do Raoni na revisão de 18/11/2026:
--   - service_types.titulars: titular e reserva do tipo inteiro, por função ({ id da função: [titular, reserva] }),
--     como a turma fixa da série (0023), mas para todos os eventos do tipo. A turma fixa da série vence a do tipo;
--   - set_type_titular(tipo, função, pessoas): só administradores; o app chama com internet;
--   - tipo novo PLANTÃO ONLINE para os "Plantão de dúvidas" (English@USP), com 1 vaga de Mediação: a mesma pessoa da
--     Mediação faz todos, escolhida na tela do tipo;
--   - NAO ESCALAR passa a pegar os títulos que abrem com exame, consulta, licença, atestado ou ausência (o app já
--     conta essas pessoas como fora no horário do evento).
-- Os eventos sem tipo passam pelas regras de novo na próxima leitura da agenda (serviço de fundo da 1.2.0); os de
-- tipo escolhido à mão não mudam. Desfazer: supabase/rollback/0026_down.sql.

alter table public.service_types add column titulars jsonb check (titulars is null or jsonb_typeof(titulars) = 'object');

create function public.set_type_titular(p_type uuid, p_role uuid, p_people uuid[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  -- Na ordem que veio: titular primeiro, reserva depois.
  v_people uuid[] := array(select x from unnest(coalesce(p_people, '{}')) with ordinality as u (x, i) where x is not null order by i);
begin
  if not public.is_admin() then
    perform public.fail('forbidden', 'Só administradores mudam o titular do tipo.');
  end if;
  if not exists (select 1 from public.service_types t where t.id = p_type) or not exists (select 1 from public.job_roles r where r.id = p_role) then
    perform public.fail('not_found', 'Tipo ou função não encontrada.');
  end if;
  if cardinality(v_people) > 2
     or cardinality(v_people) <> (select count(distinct x) from unnest(v_people) x)
     or exists (select 1 from unnest(v_people) x where not exists (select 1 from public.people p where p.id = x)) then
    perform public.fail('not_found', 'Escolha o titular e, se quiser, um reserva (pessoas diferentes).');
  end if;
  -- Sem ninguém, a função sai da lista.
  update public.service_types
  set titulars = nullif(case when cardinality(v_people) = 0 then coalesce(titulars, '{}') - p_role::text
                             else coalesce(titulars, '{}') || jsonb_build_object(p_role::text, to_jsonb(v_people)) end, '{}')
  where id = p_type;
  return jsonb_build_object('status', 'applied');
end;
$$;

grant execute on function public.set_type_titular(uuid, uuid, uuid[]) to authenticated;

-- PLANTÃO ONLINE com 1 vaga de Mediação (tipo sem porte: equipe única, guardada como porte 2).
insert into public.service_types (name, keywords)
select 'PLANTAO ONLINE', array['^plantao de duvidas', 'plantao de duvidas']
where not exists (select 1 from public.service_types t where public.norm_name(t.name) = 'plantao online');

insert into public.service_type_crew (service_type_id, job_role_id, quantity, size)
select t.id, r.id, 1, 2
from public.service_types t, public.job_roles r
where public.norm_name(t.name) = 'plantao online' and public.norm_name(r.name) = 'mediacao' and r.archived_at is null
on conflict do nothing;

-- O "plantao de duvidas" sai do CURSO ONLINE para não empatar com o tipo novo.
update public.service_types set keywords = array_remove(keywords, 'plantao de duvidas')
where public.norm_name(name) = 'curso online' and 'plantao de duvidas' = any (keywords);

update public.service_types
set keywords = keywords || array(select k from unnest(array['^exame', '^exames', '^consulta', '^licenca', '^atestado', '^ausencia']) k where k <> all (keywords))
where public.norm_name(name) = 'nao escalar';
