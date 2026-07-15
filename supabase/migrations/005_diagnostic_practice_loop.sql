-- Persists a diagnostic run and ties every learner response to the exact
-- diagnostic or practice session that produced it.
create table if not exists diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references students(id) on delete cascade,
  assignment_id text not null references assignments(id) on delete cascade,
  status text not null check (status in ('active', 'complete')) default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table student_responses
  add column if not exists diagnostic_session_id uuid references diagnostic_sessions(id) on delete cascade,
  add column if not exists practice_session_id text references practice_sessions(id) on delete cascade;

alter table student_responses
  drop constraint if exists student_responses_session_context_check;

alter table student_responses
  add constraint student_responses_session_context_check
  check (
    (context = 'diagnostic' and diagnostic_session_id is not null and practice_session_id is null)
    or (context = 'practice' and practice_session_id is not null and diagnostic_session_id is null)
  );

create unique index if not exists diagnostic_sessions_one_active_per_assignment_idx
  on diagnostic_sessions (student_id, assignment_id)
  where status = 'active';

create index if not exists diagnostic_sessions_student_assignment_idx
  on diagnostic_sessions (student_id, assignment_id, status);

create index if not exists student_responses_diagnostic_session_idx
  on student_responses (diagnostic_session_id, submitted_at);

create index if not exists student_responses_practice_session_idx
  on student_responses (practice_session_id, submitted_at);

alter table diagnostic_sessions enable row level security;

create policy diagnostic_sessions_select_self_or_owned_class on diagnostic_sessions
  for select to authenticated
  using (public.student_owns(student_id) or public.teacher_can_access_student(student_id));

-- Browser-session creation remains server-owned. Route handlers validate the
-- actor then use the trusted server path to create a session and derived data.
