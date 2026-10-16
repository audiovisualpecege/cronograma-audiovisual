-- Semente padrão do _tests.md (a mesma de packages/core/src/cases/seed.ts), com nomes e e-mails inventados.
-- Pode rodar de novo a qualquer momento: limpa tudo e grava do zero. Relógio das regras fixo na quarta
-- 21/10/2026 12:00 em Brasília: semana A (19/10) é a corrente e já está publicada, semana B (26/10) só tem
-- os eventos da agenda, e a semana de 12/10 é passada e ficou em montagem.
--
-- Identificadores fixos (hexadecimais) para os testes:
--   setores a0..01-03, funções b0..01-06 (R1-R6), tipos c0..01-04 (T1-T4), pessoas d0..01-20 (P1-P20),
--   contas do Auth e0..01-20, origens f0..01-02 (S1, S2), semanas 10..01 (12/10) e 10..02 (A),
--   eventos 20..01 (E0, 12/10), 20..11-13 (E1-E3, semana A), 20..21-25 (B1-B5, semana B), vagas 30..XX.
-- Todas as pessoas entram com a senha Senha-teste-123.

truncate table
  public.applied_ops, public.notifications, public.push_subscriptions, public.jobs,
  public.history_entries, public.history_imports, public.publications, public.published_assignments,
  public.assignments, public.slots, public.events, public.weeks, public.calendar_sources, public.absences,
  public.service_type_crew, public.service_types, public.person_roles, public.people, public.job_roles,
  public.sectors, public.settings, private.secrets, private.clock;

delete from auth.users where email like '%@exemplo.test';

insert into private.clock (now_override) values ('2026-10-21T12:00:00-03:00');
insert into public.settings default values;

insert into public.sectors (id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'Edição'),
  ('a0000000-0000-4000-8000-000000000002', 'Produção'),
  ('a0000000-0000-4000-8000-000000000003', 'Técnica');

insert into public.job_roles (id, code, name, sector_id) values
  ('b0000000-0000-4000-8000-000000000001', 'R1', 'Câmera', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000002', 'R2', 'Áudio', 'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000003', 'R3', 'Edição', 'a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'R4', 'Mediação', 'a0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000005', 'R5', 'Técnico de aula', 'a0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000006', 'R6', 'Produção', 'a0000000-0000-4000-8000-000000000002');
select setval('public.job_roles_code_seq', 6);

insert into public.service_types (id, code, name, keywords, no_team) values
  ('c0000000-0000-4000-8000-000000000001', 'T1', 'Gravação de aula', '{aula}', false),
  ('c0000000-0000-4000-8000-000000000002', 'T2', 'Evento externo', '{}', false),
  ('c0000000-0000-4000-8000-000000000003', 'T3', 'Transmissão ao vivo', '{}', false),
  ('c0000000-0000-4000-8000-000000000004', 'T4', 'Reunião', '{}', true);
select setval('public.service_types_code_seq', 4);

insert into public.service_type_crew (service_type_id, job_role_id, quantity) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 1),
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 1),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 2),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 1),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000006', 1);

-- Contas do Auth local (e-mail e senha), já confirmadas.
do $$
declare pw text := extensions.crypt('Senha-teste-123', extensions.gen_salt('bf', 6));
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select
    '00000000-0000-0000-0000-000000000000',
    ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
    'authenticated', 'authenticated',
    'pessoa' || lpad(n::text, 2, '0') || '@exemplo.test',
    pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''
  from generate_series(1, 20) n;

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
  from auth.users u where u.email like '%@exemplo.test';
end;
$$;

-- P1 e P2 administradores; funções de cada pessoa como em cases/seed.ts.
insert into public.people (id, auth_user_id, code, name, email, sector_id, profile, invite_status)
select
  ('d0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  ('e0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'P' || n,
  'Pessoa Exemplo ' || lpad(n::text, 2, '0'),
  'pessoa' || lpad(n::text, 2, '0') || '@exemplo.test',
  case when n <= 2 then 'a0000000-0000-4000-8000-000000000002'::uuid else 'a0000000-0000-4000-8000-000000000003'::uuid end,
  case when n <= 2 then 'admin' else 'team' end,
  'accepted'
from generate_series(1, 20) n;
select setval('public.people_code_seq', 20);

insert into public.person_roles (person_id, job_role_id)
select ('d0000000-0000-4000-8000-0000000000' || lpad(pr.p::text, 2, '0'))::uuid,
       ('b0000000-0000-4000-8000-00000000000' || pr.r)::uuid
from (values
  (1, 6), (2, 6), (3, 1), (4, 1), (5, 1), (6, 1), (6, 5), (7, 1), (7, 2), (8, 1), (9, 2), (10, 2),
  (11, 2), (11, 3), (12, 3), (13, 3), (14, 3), (14, 4), (15, 4), (16, 4), (17, 5), (18, 5), (18, 1),
  (19, 6), (20, 6), (20, 2)
) as pr (p, r);

insert into public.calendar_sources (id, google_calendar_id, label, status, last_synced_at) values
  ('f0000000-0000-4000-8000-000000000001', 'pecegeworks@gmail.com', 'pecegeworks', 'connected', '2026-10-21T11:45:00-03:00'),
  ('f0000000-0000-4000-8000-000000000002', 'audiovisualpecege@gmail.com', 'audiovisualpecege', 'connected', '2026-10-21T11:45:00-03:00');

-- Semanas: 12/10 passada em montagem; A publicada na revisão 2 (P11 saiu do Áudio do E2 e P10 entrou).
insert into public.weeks (id, week_start, state, revision, published_at, published_by) values
  ('10000000-0000-4000-8000-000000000001', '2026-10-12', 'building', 0, null, null),
  ('10000000-0000-4000-8000-000000000002', '2026-10-19', 'published', 2, '2026-10-16T17:00:00-03:00', 'd0000000-0000-4000-8000-000000000001');

insert into public.events (
  id, origin, calendar_source_id, google_event_id, title, location, starts_at, ends_at,
  service_type_id, type_certainty, type_source, no_team, notes
) values
  ('20000000-0000-4000-8000-000000000001', 'calendar', 'f0000000-0000-4000-8000-000000000001', 'g-e0',
   'Gravação aula Estatística', 'Estúdio 1', '2026-10-14T09:00:00-03:00', '2026-10-14T12:00:00-03:00',
   'c0000000-0000-4000-8000-000000000001', 'alta', 'keyword', false, null),
  ('20000000-0000-4000-8000-000000000011', 'calendar', 'f0000000-0000-4000-8000-000000000001', 'g-e1',
   'Gravação aula Matemática', 'Estúdio 1', '2026-10-22T14:00:00-03:00', '2026-10-22T17:00:00-03:00',
   'c0000000-0000-4000-8000-000000000001', 'alta', 'keyword', false, 'Levar o teleprompter'),
  ('20000000-0000-4000-8000-000000000012', 'calendar', 'f0000000-0000-4000-8000-000000000002', 'g-e2',
   'Congresso de Agronegócio', 'Centro de Convenções', '2026-10-23T08:00:00-03:00', '2026-10-23T12:00:00-03:00',
   'c0000000-0000-4000-8000-000000000002', 'alta', 'admin', false, 'Credenciamento às 7h30'),
  ('20000000-0000-4000-8000-000000000013', 'calendar', 'f0000000-0000-4000-8000-000000000002', 'g-e3',
   'Reunião de pauta', 'Sala 3', '2026-10-20T10:00:00-03:00', '2026-10-20T11:00:00-03:00',
   'c0000000-0000-4000-8000-000000000004', 'alta', 'admin', true, null),
  ('20000000-0000-4000-8000-000000000021', 'calendar', 'f0000000-0000-4000-8000-000000000001', 'g-b1',
   'Gravação aula Biologia', 'Estúdio 1', '2026-10-26T09:00:00-03:00', '2026-10-26T12:00:00-03:00',
   'c0000000-0000-4000-8000-000000000001', 'alta', 'keyword', false, null),
  ('20000000-0000-4000-8000-000000000022', 'calendar', 'f0000000-0000-4000-8000-000000000001', 'g-b2',
   'Gravação aula Química', 'Estúdio 2', '2026-10-27T14:00:00-03:00', '2026-10-27T17:00:00-03:00',
   'c0000000-0000-4000-8000-000000000001', 'alta', 'keyword', false, null),
  ('20000000-0000-4000-8000-000000000023', 'calendar', 'f0000000-0000-4000-8000-000000000002', 'g-b3',
   'Gravação aula Física', 'Estúdio 1', '2026-10-28T09:00:00-03:00', '2026-10-28T12:00:00-03:00',
   'c0000000-0000-4000-8000-000000000001', 'alta', 'keyword', false, null),
  ('20000000-0000-4000-8000-000000000024', 'calendar', 'f0000000-0000-4000-8000-000000000002', 'g-b4',
   'Reunião de planejamento', 'Sala 3', '2026-10-29T10:00:00-03:00', '2026-10-29T11:00:00-03:00',
   'c0000000-0000-4000-8000-000000000004', 'alta', 'admin', true, null),
  ('20000000-0000-4000-8000-000000000025', 'calendar', 'f0000000-0000-4000-8000-000000000001', 'g-b5',
   'Visita técnica', 'Fazenda escola', '2026-10-30T14:00:00-03:00', '2026-10-30T16:00:00-03:00',
   null, 'baixa', null, false, null);

-- Vagas e alocações: cada vaga tem uma linha em assignments (pessoa nula = vaga aberta).
insert into public.slots (id, event_id, job_role_id) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005'),
  ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000005'),
  ('30000000-0000-4000-8000-000000000021', '20000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000022', '20000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000023', '20000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000024', '20000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000006');

insert into public.assignments (slot_id, event_id, person_id, status, decided_by, decided_at)
select s.id, s.event_id, x.person_id, case when x.person_id is null then null else 'confirmed' end,
       case when x.person_id is null then null else 'd0000000-0000-4000-8000-000000000001'::uuid end,
       case when x.person_id is null then null else '2026-10-16T16:00:00-03:00'::timestamptz end
from public.slots s
left join (values
  ('30000000-0000-4000-8000-000000000011'::uuid, 'd0000000-0000-4000-8000-000000000005'::uuid),
  ('30000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000006'),
  ('30000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000007'),
  ('30000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000008'),
  ('30000000-0000-4000-8000-000000000023', 'd0000000-0000-4000-8000-000000000010'),
  ('30000000-0000-4000-8000-000000000024', 'd0000000-0000-4000-8000-000000000019')
) as x (slot_id, person_id) on x.slot_id = s.id;

-- Fotografias da semana A: revisão 1 (P11 no Áudio do E2) e revisão 2 (P10 no lugar), a corrente.
insert into public.published_assignments (week_id, revision, event_id, slot_id, job_role_id, person_id, notes)
select '10000000-0000-4000-8000-000000000002', r.rev, s.event_id, s.id, s.job_role_id,
       case when r.rev = 1 and s.id = '30000000-0000-4000-8000-000000000023' then 'd0000000-0000-4000-8000-000000000011'::uuid
            else a.person_id end,
       e.notes
from public.slots s
join public.assignments a on a.slot_id = s.id
join public.events e on e.id = s.event_id
cross join (values (1), (2)) as r (rev)
where e.week_start = '2026-10-19';

insert into public.publications (week_id, revision, kind, published_by, published_at, summary) values
  ('10000000-0000-4000-8000-000000000002', 1, 'week', 'd0000000-0000-4000-8000-000000000001', '2026-10-15T17:00:00-03:00', '{"notified": 6}'),
  ('10000000-0000-4000-8000-000000000002', 2, 'changes', 'd0000000-0000-4000-8000-000000000001', '2026-10-16T17:00:00-03:00', '{"notified": 2}');

insert into public.absences (person_id, kind, starts_at, ends_at, all_day, note) values
  ('d0000000-0000-4000-8000-000000000010', 'folga', '2026-10-30T00:00:00-03:00', '2026-10-31T00:00:00-03:00', true, 'Folga compensatória'),
  ('d0000000-0000-4000-8000-000000000011', 'ferias', '2026-11-02T00:00:00-03:00', '2026-11-07T00:00:00-03:00', true, null);

insert into public.notifications (person_id, kind, title, body, link, dedupe_key) values
  ('d0000000-0000-4000-8000-000000000010', 'week_changed', 'Sua semana de 19/10 mudou', 'Entrou: Congresso de Agronegócio (Áudio), 23/10 08:00', '#/minha-semana/2026-10-19', 'seed:p10'),
  ('d0000000-0000-4000-8000-000000000011', 'week_changed', 'Sua semana de 19/10 mudou', 'Saiu: Congresso de Agronegócio (Áudio), 23/10 08:00', '#/minha-semana/2026-10-19', 'seed:p11');
