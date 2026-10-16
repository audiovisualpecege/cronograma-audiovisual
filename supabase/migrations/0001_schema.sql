-- Esquema da plataforma (TechSpec, Data Models). Toda tabela pública tem id uuid, version e updated_at
-- mantidos por gatilho (0003); nada é apagado pelos aparelhos: remoção vira archived_at ou estado.
-- Horários em timestamptz; semana por week_start (segunda-feira em America/Sao_Paulo).

create extension if not exists citext with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Esquema fora da API: segredos e relógio de teste. Só service_role e funções SECURITY DEFINER.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Relógio das regras de negócio. Sem linha (produção) vale now(); a semente de teste fixa a quarta 21/10.
create table private.clock (
  id boolean primary key default true check (id),
  now_override timestamptz
);

grant all on all tables in schema private to service_role;

-- ---------------------------------------------------------------------------------------------
-- Funções de apoio: relógio, fuso, semana e nomes

create function public.app_now() returns timestamptz
language sql stable security definer set search_path = ''
as $$ select coalesce((select c.now_override from private.clock c where c.id), now()) $$;

create function public.local_date(ts timestamptz) returns date
language sql immutable set search_path = ''
as $$ select (ts at time zone 'America/Sao_Paulo')::date $$;

create function public.week_start_of(ts timestamptz) returns date
language sql immutable set search_path = ''
as $$ select public.local_date(ts) - (extract(isodow from public.local_date(ts))::int - 1) $$;

create function public.monday_of(d date) returns date
language sql immutable set search_path = ''
as $$ select d - (extract(isodow from d)::int - 1) $$;

create function public.today_local() returns date
language sql stable set search_path = ''
as $$ select public.local_date(public.app_now()) $$;

-- Semana arquivada: week_start + 7 dias <= hoje (TechSpec, tabela weeks; isWeekPast do core).
create function public.is_week_past(ws date) returns boolean
language sql stable set search_path = ''
as $$ select ws + 7 <= public.today_local() $$;

-- Minúsculas, sem acentos e com espaços simples, como normalizeName do core.
create function public.norm_name(s text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(s, ''))), '\s+', ' ', 'g'))
$$;

-- Erro de regra: o cliente mostra o DETAIL (TechSpec, convenções de erro).
create function public.fail(code text, detail text) returns void
language plpgsql set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = code, detail = detail;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Cadastros

create sequence public.people_code_seq;
create sequence public.job_roles_code_seq;
create sequence public.service_types_code_seq;

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create unique index sectors_name_key on public.sectors (public.norm_name(name));

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'R' || nextval('public.job_roles_code_seq'),
  name text not null check (btrim(name) <> ''),
  sector_id uuid references public.sectors (id),
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create unique index job_roles_name_key on public.job_roles (public.norm_name(name));

create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  code text not null unique default 'P' || nextval('public.people_code_seq'),
  name text not null check (btrim(name) <> ''),
  -- Nulo só para pessoa inativa criada pela importação do histórico.
  email extensions.citext unique,
  sector_id uuid references public.sectors (id),
  profile text not null default 'team' check (profile in ('admin', 'team')),
  weekly_limit_hours numeric not null default 44 check (weekly_limit_hours between 1 and 80),
  active boolean not null default true,
  invite_status text not null default 'pending' check (invite_status in ('pending', 'sent', 'accepted')),
  push_enabled boolean not null default true,
  ical_token text unique,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  constraint people_email_when_active check (email is not null or not active)
);

-- Funções habilitadas; tirar uma função arquiva a linha para a leitura incremental ver.
create table public.person_roles (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id),
  job_role_id uuid not null references public.job_roles (id),
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (person_id, job_role_id)
);

create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'T' || nextval('public.service_types_code_seq'),
  name text not null check (btrim(name) <> ''),
  keywords text[] not null default '{}',
  no_team boolean not null default false,
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create unique index service_types_name_key on public.service_types (public.norm_name(name));

create table public.service_type_crew (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types (id),
  job_role_id uuid not null references public.job_roles (id),
  quantity int not null check (quantity between 1 and 30),
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (service_type_id, job_role_id)
);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id),
  kind text not null check (kind in ('folga', 'ferias', 'ausencia')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  note text check (char_length(note) <= 2000),
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  constraint absences_end_after_start check (ends_at > starts_at)
);
create index absences_person_idx on public.absences (person_id) where archived_at is null;

-- ---------------------------------------------------------------------------------------------
-- Agenda e semanas

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  google_calendar_id text not null unique,
  label text not null,
  enabled boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  last_synced_at timestamptz,
  last_error text,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- Sem linha = "sem montagem"; arquivada = week_start + 7 dias <= hoje.
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique check (extract(isodow from week_start) = 1),
  state text not null default 'building' check (state in ('building', 'published')),
  revision int not null default 0,
  dirty_since timestamptz,
  published_at timestamptz,
  published_by uuid references public.people (id),
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  origin text not null default 'calendar' check (origin in ('calendar', 'internal')),
  calendar_source_id uuid references public.calendar_sources (id),
  google_event_id text,
  week_start date not null,
  title text not null default '',
  location text,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  period_start timestamptz,
  period_end timestamptz,
  fingerprint text,
  status text not null default 'active' check (status in ('active', 'changed', 'cancelled')),
  change_original jsonb,
  review_pending boolean not null default false,
  restored boolean not null default false,
  duplicate_group text,
  -- Possível duplicado resolvido com "manter um": o outro fica ignorado, sem vagas.
  ignored boolean not null default false,
  service_type_id uuid references public.service_types (id),
  type_certainty text check (type_certainty in ('alta', 'media', 'baixa')),
  type_source text check (type_source in ('keyword', 'history', 'ai', 'admin')),
  no_team boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  crew_outdated boolean not null default false,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (calendar_source_id, google_event_id),
  constraint events_internal_without_source check (origin = 'calendar' or (calendar_source_id is null and google_event_id is null)),
  constraint events_end_not_before_start check (ends_at >= starts_at)
);
create index events_week_idx on public.events (week_start);

-- Intervalo que ocupa a pessoa: dia inteiro sem período ocupa o dia (eventInterval/busyInterval do core).
create function public.event_busy(e public.events) returns tstzrange
language sql immutable set search_path = ''
as $$
  select case
    when e.all_day and e.period_start is not null and e.period_end is not null
      then tstzrange(e.period_start, greatest(e.period_start, e.period_end), '[)')
    else tstzrange(e.starts_at, greatest(e.starts_at, e.ends_at), '[)')
  end
$$;

-- Horas do evento; 0 para dia inteiro sem período (eventHours do core).
create function public.event_hours(e public.events) returns numeric
language sql immutable set search_path = ''
as $$
  select case
    when e.all_day and (e.period_start is null or e.period_end is null) then 0::numeric
    when e.all_day then greatest(0, extract(epoch from (e.period_end - e.period_start)) / 3600)
    else greatest(0, extract(epoch from (e.ends_at - e.starts_at)) / 3600)
  end
$$;

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  job_role_id uuid not null references public.job_roles (id),
  extra boolean not null default false,
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create index slots_event_idx on public.slots (event_id);

-- Uma linha por vaga, criada junto com ela. person_id nulo = vaga aberta; limpar ou descartar volta a nulo
-- (sem DELETE, para a leitura incremental ver a mudança).
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null unique references public.slots (id),
  event_id uuid not null references public.events (id),
  person_id uuid references public.people (id),
  status text check (status in ('proposed', 'confirmed')),
  locked boolean not null default false,
  warnings text[] not null default '{}',
  override boolean not null default false,
  reason text,
  decided_by uuid references public.people (id),
  decided_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (event_id, person_id),
  constraint assignments_status_with_person check ((person_id is null) = (status is null))
);
create index assignments_person_idx on public.assignments (person_id) where person_id is not null;

-- Fotografia publicada por revisão (ADR-011); só inserção.
create table public.published_assignments (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks (id),
  revision int not null,
  event_id uuid not null references public.events (id),
  slot_id uuid references public.slots (id),
  job_role_id uuid not null references public.job_roles (id),
  person_id uuid references public.people (id),
  notes text,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create index published_assignments_week_idx on public.published_assignments (week_id, revision);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks (id),
  revision int not null,
  kind text not null check (kind in ('week', 'changes')),
  published_by uuid references public.people (id),
  published_at timestamptz not null default now(),
  summary jsonb not null default '{}',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (week_id, revision)
);

-- ---------------------------------------------------------------------------------------------
-- Histórico importado

create table public.history_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  imported_by uuid references public.people (id),
  imported_at timestamptz not null default now(),
  counts jsonb not null default '{}',
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- Uma linha por pessoa numa função num evento da planilha; evento sem ninguém vira uma linha sem pessoa.
create table public.history_entries (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.history_imports (id),
  week_start date not null,
  event_date date not null,
  event_key text not null,
  title text not null,
  hours numeric not null default 0,
  service_type_id uuid references public.service_types (id),
  job_role_id uuid references public.job_roles (id),
  person_id uuid references public.people (id),
  raw_name text,
  -- Substituída por uma importação nova da mesma semana.
  archived_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create index history_entries_week_idx on public.history_entries (week_start) where archived_at is null;

-- ---------------------------------------------------------------------------------------------
-- Avisos, push, fila do serviço de fundo e configuração

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id),
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text not null,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (person_id, dedupe_key)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_ok_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'calendar_sync', 'classify', 'propose', 'test_ai_key', 'invite',
    'auth_ban', 'auth_unban', 'ical_publish', 'ical_revoke'
  )),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  -- Igual para pedidos que não podem correr em dobro (uma releitura, uma proposta por semana...).
  dedupe_key text,
  requested_by uuid references public.people (id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create unique index jobs_active_dedupe on public.jobs (kind, dedupe_key)
  where status in ('queued', 'running') and dedupe_key is not null;
create index jobs_status_idx on public.jobs (status, created_at);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  calendar_poll_enabled boolean not null default true,
  calendar_poll_minutes int not null default 15 check (calendar_poll_minutes between 5 and 120),
  ai_proposal_enabled boolean not null default true,
  ai_classification_enabled boolean not null default true,
  ai_provider text not null default 'gemini',
  ai_model text not null default 'gemini-2.5-flash',
  ai_key_hint text,
  push_enabled_global boolean not null default true,
  worker_seen_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

-- Idempotência da fila de envio (ADR-009): cada op_id aplicado guarda o resultado devolvido.
create table public.applied_ops (
  op_id uuid primary key,
  person_id uuid references public.people (id),
  kind text,
  result jsonb,
  applied_at timestamptz not null default now()
);
