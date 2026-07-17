-- Student joins for an isolated, non-production teacher workspace. Raw join
-- codes are readable only by the server's service role through the owner
-- session; neither this table nor the student-session table has browser RLS.
alter table public.teacher_demo_sessions
  add column if not exists assignment_id text references public.assignments(id) on delete cascade,
  add column if not exists join_code text;

-- Workspaces created before class-specific diagnostics existed cannot safely
-- accept joined learners. End those short-lived demo capabilities instead of
-- guessing an assignment or attaching them to the public walkthrough one.
update public.teacher_demo_sessions
  set revoked_at = coalesce(revoked_at, now())
  where assignment_id is null;

create unique index if not exists teacher_demo_sessions_join_code_idx
  on public.teacher_demo_sessions (join_code)
  where join_code is not null and revoked_at is null;

create table if not exists public.teacher_demo_student_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_demo_session_id uuid not null references public.teacher_demo_sessions(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  assignment_id text not null references public.assignments(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists teacher_demo_student_sessions_expiry_idx
  on public.teacher_demo_student_sessions (expires_at) where revoked_at is null;
create index if not exists teacher_demo_student_sessions_class_assignment_idx
  on public.teacher_demo_student_sessions (class_id, assignment_id) where revoked_at is null;
create index if not exists teacher_demo_student_sessions_parent_idx
  on public.teacher_demo_student_sessions (teacher_demo_session_id) where revoked_at is null;
alter table public.teacher_demo_student_sessions enable row level security;

-- Replaces the workspace creator so every temporary class has exactly one
-- class-scoped diagnostic built from the canonical seeded fractions items.
create or replace function public.create_teacher_demo_workspace(
  p_teacher_display_name text, p_class_name text, p_token_hash text, p_join_code text, p_expires_at timestamptz
) returns table (class_id text, assignment_id text, class_name text, teacher_display_name text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_teacher_name text := btrim(coalesce(p_teacher_display_name, ''));
  v_class_name text := btrim(coalesce(p_class_name, ''));
  v_teacher_id text := 'teacher-demo-' || replace(gen_random_uuid()::text, '-', '');
  v_class_id text := 'teacher-demo-class-' || replace(gen_random_uuid()::text, '-', '');
  v_assignment_id text := 'teacher-demo-diagnostic-' || replace(gen_random_uuid()::text, '-', '');
  v_student_id text;
  v_roster text[] := array['Avery Chen', 'Diego Morales', 'Imani Brooks', 'Noah Patel', 'Sofia Williams', 'Theo Nguyen'];
  v_student_name text;
  v_index int := 0;
begin
  if length(v_teacher_name) < 1 or length(v_teacher_name) > 48 then raise exception 'Teacher display name must be 1 to 48 characters.'; end if;
  if length(v_class_name) < 1 or length(v_class_name) > 80 then raise exception 'Class name must be 1 to 80 characters.'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Teacher workspace session token is invalid.'; end if;
  if coalesce(p_join_code, '') !~ '^[A-F0-9]{4}(-[A-F0-9]{4}){2}$' then raise exception 'Teacher workspace join code is invalid.'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then raise exception 'Teacher workspace expiry must be within the next 24 hours.'; end if;
  if not exists (select 1 from public.topics where id = 'fractions-rational-operations') then raise exception 'Teacher workspace needs the seeded fractions topic.'; end if;
  if (select count(*) from public.items where id = any (array['equivalent-1', 'number-line-1', 'common-denominator-1', 'add-unlike-1', 'subtract-unlike-1'])) <> 5 then raise exception 'Teacher workspace needs all canonical diagnostic items.'; end if;

  insert into public.teachers (id, display_name) values (v_teacher_id, v_teacher_name);
  insert into public.classes (id, name, teacher_display_name, teacher_id) values (v_class_id, v_class_name, v_teacher_name, v_teacher_id);
  insert into public.assignments (id, class_id, topic_id, title, mode)
  values (v_assignment_id, v_class_id, 'fractions-rational-operations', 'Fractions check-in', 'diagnostic');
  insert into public.assignment_items (assignment_id, item_id, position) values
    (v_assignment_id, 'equivalent-1', 1), (v_assignment_id, 'number-line-1', 2),
    (v_assignment_id, 'common-denominator-1', 3), (v_assignment_id, 'add-unlike-1', 4),
    (v_assignment_id, 'subtract-unlike-1', 5);

  foreach v_student_name in array v_roster loop
    v_index := v_index + 1;
    v_student_id := 'teacher-demo-student-' || replace(gen_random_uuid()::text, '-', '');
    insert into public.students (id, display_name, grade_band, is_demo_default) values (v_student_id, v_student_name, case when v_index <= 3 then '6' else '7' end, false);
    insert into public.class_enrollments (class_id, student_id) values (v_class_id, v_student_id);
    insert into public.mastery (student_id, subskill_id, level, evidence_count, evidence_summary, last_evaluated_at)
      select v_student_id, skill.id,
        (array['developing', 'needs_support', 'mastered', 'developing', 'not_started', 'needs_support'])[((v_index + row_number() over (order by skill.id)::int - 2) % 6) + 1],
        1, 'Fictional starter evidence for this temporary workspace.', now()
      from public.subskills skill where skill.topic_id = 'fractions-rational-operations';
  end loop;
  insert into public.teacher_demo_sessions (teacher_id, class_id, assignment_id, token_hash, join_code, expires_at)
  values (v_teacher_id, v_class_id, v_assignment_id, p_token_hash, p_join_code, p_expires_at);
  return query select v_class_id, v_assignment_id, v_class_name, v_teacher_name, p_expires_at;
end;
$$;

-- The RPC is the only durable join path. Its predicates force the code,
-- class, assignment, enrollment, mastery matrix, and cookie to stay together.
create or replace function public.join_teacher_demo_workspace(
  p_join_code text, p_display_name text, p_token_hash text, p_expires_at timestamptz
) returns table (student_id text, display_name text, grade_band text, class_id text, assignment_id text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_session public.teacher_demo_sessions%rowtype;
  v_student_id text := 'teacher-demo-learner-' || replace(gen_random_uuid()::text, '-', '');
  v_expiry timestamptz;
begin
  if length(v_display_name) < 1 or length(v_display_name) > 32 then raise exception 'A joined student needs a first name or nickname of 1 to 32 characters.'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Joined student session token is invalid.'; end if;
  if coalesce(p_join_code, '') !~ '^[A-F0-9]{4}(-[A-F0-9]{4}){2}$' then raise exception 'Join code is invalid.'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then raise exception 'Joined student expiry must be within the next 24 hours.'; end if;
  select session.* into v_session from public.teacher_demo_sessions session
    where session.join_code = p_join_code and session.revoked_at is null and session.expires_at > now() for update;
  if not found then raise exception 'That join code is not active.'; end if;
  if not exists (select 1 from public.assignments assignment where assignment.id = v_session.assignment_id and assignment.class_id = v_session.class_id and assignment.mode = 'diagnostic') then
    raise exception 'The joined assignment does not belong to this class.';
  end if;
  v_expiry := least(p_expires_at, v_session.expires_at);
  insert into public.students (id, display_name, grade_band, is_demo_default) values (v_student_id, v_display_name, '6-8', false);
  insert into public.class_enrollments (class_id, student_id) values (v_session.class_id, v_student_id);
  insert into public.mastery (student_id, subskill_id, level, evidence_count, evidence_summary, last_evaluated_at)
    select v_student_id, skill.id, 'not_started', 0, 'Joined this temporary workspace and has not submitted work yet.', now()
    from public.subskills skill join public.assignments assignment on assignment.topic_id = skill.topic_id
    where assignment.id = v_session.assignment_id and assignment.class_id = v_session.class_id;
  insert into public.teacher_demo_student_sessions (teacher_demo_session_id, student_id, class_id, assignment_id, token_hash, expires_at)
    values (v_session.id, v_student_id, v_session.class_id, v_session.assignment_id, p_token_hash, v_expiry);
  return query select v_student_id, v_display_name, '6-8'::text, v_session.class_id, v_session.assignment_id, v_expiry;
end;
$$;

revoke all on function public.create_teacher_demo_workspace(text, text, text, text, timestamptz) from public;
revoke all on function public.join_teacher_demo_workspace(text, text, text, timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_teacher_demo_workspace(text, text, text, text, timestamptz) to service_role;
    grant execute on function public.join_teacher_demo_workspace(text, text, text, timestamptz) to service_role;
  end if;
end $$;
