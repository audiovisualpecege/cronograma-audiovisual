-- RLS por perfil (TechSpec, Data Models). A chave pública vai no build do app: é esta camada que impede
-- a equipe de ver rascunho, proposta, configuração e histórico. Escrita dos aparelhos só pelas RPCs.

-- Pessoa ativa da sessão; nulo para quem não tem cadastro ativo (inativo perde tudo na hora).
create function public.current_person() returns uuid
language sql stable security definer set search_path = ''
as $$ select p.id from public.people p where p.auth_user_id = (select auth.uid()) and p.active $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.people p where p.auth_user_id = (select auth.uid()) and p.active and p.profile = 'admin'
  )
$$;

-- Tipo que não exige equipe, lido sem expor service_types à equipe.
create function public.service_type_no_team(type_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select t.no_team from public.service_types t where t.id = type_id), false) $$;

-- Revisão publicada corrente de uma semana, ou nulo se ela não está publicada.
create function public.published_revision(p_week_id uuid) returns int
language sql stable security definer set search_path = ''
as $$ select w.revision from public.weeks w where w.id = p_week_id and w.state = 'published' $$;

create function public.week_is_published(ws date) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.weeks w where w.week_start = ws and w.state = 'published') $$;

-- ---------------------------------------------------------------------------------------------
-- Liga a RLS em todas as tabelas públicas

do $$
declare t text;
begin
  foreach t in array array[
    'sectors', 'job_roles', 'people', 'person_roles', 'service_types', 'service_type_crew', 'absences',
    'calendar_sources', 'weeks', 'events', 'slots', 'assignments', 'published_assignments', 'publications',
    'history_imports', 'history_entries', 'notifications', 'push_subscriptions', 'jobs', 'settings', 'applied_ops'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Só administradores: escala de trabalho, fila, configuração, agendas e histórico.
do $$
declare t text;
begin
  foreach t in array array[
    'people', 'service_types', 'service_type_crew', 'absences', 'calendar_sources', 'weeks', 'events',
    'slots', 'assignments', 'published_assignments', 'publications', 'history_imports', 'history_entries',
    'jobs', 'settings'
  ] loop
    execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- Qualquer pessoa ativa: setores, funções e funções habilitadas de cada um.
create policy active_read on public.sectors for select to authenticated
  using ((select public.current_person()) is not null);
create policy active_read on public.job_roles for select to authenticated
  using ((select public.current_person()) is not null);
create policy active_read on public.person_roles for select to authenticated
  using ((select public.current_person()) is not null);

-- O próprio cadastro (com e-mail, preferências e token do feed).
create policy own_read on public.people for select to authenticated
  using (id = (select public.current_person()));

-- Semanas publicadas.
create policy team_read on public.weeks for select to authenticated
  using (state = 'published' and (select public.current_person()) is not null);

-- Eventos de semanas publicadas que exigem equipe; observações vão junto.
create policy team_read on public.events for select to authenticated
  using (
    (select public.current_person()) is not null
    and public.week_is_published(week_start)
    and not no_team
    and not ignored
    and not public.service_type_no_team(service_type_id)
  );

-- Só a revisão corrente da fotografia publicada.
create policy team_read on public.published_assignments for select to authenticated
  using ((select public.current_person()) is not null and revision = public.published_revision(week_id));

-- As próprias ausências.
create policy own_read on public.absences for select to authenticated
  using (person_id = (select public.current_person()));

-- Os próprios avisos: ler e marcar como lido (a coluna read_at é a única liberada para escrita).
create policy own_read on public.notifications for select to authenticated
  using (person_id = (select public.current_person()));
create policy own_mark_read on public.notifications for update to authenticated
  using (person_id = (select public.current_person()))
  with check (person_id = (select public.current_person()));

create policy own_read on public.push_subscriptions for select to authenticated
  using (person_id = (select public.current_person()));

-- applied_ops: nenhuma política; só as funções SECURITY DEFINER leem.

-- ---------------------------------------------------------------------------------------------
-- Privilégios: leitura pela RLS, nenhuma escrita direta (nada é apagado pelo REST).

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke select on public.applied_ops from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Pessoas sem e-mail: ativo lê nome, código, setor, perfil e situação de todos. A view roda como dono
-- e filtra pela sessão; sem sessão ou com pessoa inativa não devolve nada.

create view public.people_public with (security_barrier) as
select p.id, p.code, p.name, p.sector_id, p.profile, p.active, p.version, p.updated_at
from public.people p
where (select public.current_person()) is not null;

revoke all on public.people_public from anon, authenticated;
grant select on public.people_public to anon, authenticated;
