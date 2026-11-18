-- Desfaz a 0026: o titular do tipo e o set_type_titular saem; o PLANTAO ONLINE é arquivado (os eventos que já
-- tinham esse tipo continuam com ele até alguém trocar); as palavras voltam como eram.
-- Depois de rodar: npx supabase migration repair --status reverted 0026
begin;

drop function public.set_type_titular(uuid, uuid, uuid[]);
alter table public.service_types drop column titulars;

update public.service_types set archived_at = now() where public.norm_name(name) = 'plantao online' and archived_at is null;

update public.service_types set keywords = keywords || array['plantao de duvidas']
where public.norm_name(name) = 'curso online' and not ('plantao de duvidas' = any (keywords));

update public.service_types
set keywords = array(select k from unnest(keywords) k where k not in ('^exame', '^exames', '^consulta', '^licenca', '^atestado', '^ausencia'))
where public.norm_name(name) = 'nao escalar';

commit;
