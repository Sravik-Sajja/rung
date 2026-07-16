-- Temporary learner identities for the non-production walkthrough.
--
-- The browser stores only a random opaque token in an httpOnly cookie. This
-- table stores its SHA-256 hash, never the raw token, and is deliberately
-- server-only: no browser RLS policy can create a learner, pick another
-- learner's ID, or read the demo session table.

create table if not exists public.demo_participant_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists demo_participant_sessions_class_idx
  on public.demo_participant_sessions (class_id, created_at desc);

create index if not exists demo_participant_sessions_expiry_idx
  on public.demo_participant_sessions (expires_at)
  where revoked_at is null;

alter table public.demo_participant_sessions enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies: only the trusted server service
-- role calls the RPC below and resolves a session by its hashed token.

create or replace function public.create_demo_participant(
  p_display_name text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (
  student_id text,
  display_name text,
  grade_band text,
  class_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id text;
  v_display_name text;
  v_class_id constant text := 'fractions-demo-class';
  v_topic_id constant text := 'fractions-rational-operations';
begin
  v_display_name := btrim(coalesce(p_display_name, ''));
  if length(v_display_name) < 1 or length(v_display_name) > 32 then
    raise exception 'A temporary learner needs a first name or nickname of 1 to 32 characters.';
  end if;

  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'The temporary session token is invalid.';
  end if;

  -- The app requests an eight-hour session. This upper bound keeps a future
  -- malformed server caller from creating a quasi-permanent anonymous login.
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'The temporary session expiry must be within the next 24 hours.';
  end if;

  if not exists (select 1 from public.classes where id = v_class_id) then
    raise exception 'The configured demo class does not exist. Run the demo seed first.';
  end if;

  if not exists (select 1 from public.subskills where topic_id = v_topic_id) then
    raise exception 'The configured demo curriculum does not exist. Run the demo seed first.';
  end if;

  v_student_id := 'demo-learner-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.students (id, display_name, grade_band, is_demo_default)
  values (v_student_id, v_display_name, '6-8', false);

  insert into public.class_enrollments (class_id, student_id)
  values (v_class_id, v_student_id);

  -- A full initial matrix lets the teacher heatmap show the new learner before
  -- their first response. Derived mastery updates remain server-owned.
  insert into public.mastery (
    student_id,
    subskill_id,
    level,
    evidence_count,
    evidence_summary,
    last_evaluated_at
  )
  select
    v_student_id,
    skill.id,
    'not_started',
    0,
    'Temporary demo learner has not submitted work yet.',
    now()
  from public.subskills skill
  where skill.topic_id = v_topic_id;

  insert into public.demo_participant_sessions (student_id, class_id, token_hash, expires_at)
  values (v_student_id, v_class_id, p_token_hash, p_expires_at);

  return query
  select v_student_id, v_display_name, '6-8'::text, v_class_id, p_expires_at;
end;
$$;

revoke all on function public.create_demo_participant(text, text, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_demo_participant(text, text, timestamptz) to service_role;
  end if;
end;
$$;
