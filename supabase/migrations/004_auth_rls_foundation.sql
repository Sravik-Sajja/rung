-- Forward-looking authentication and RLS foundation.
--
-- The hackathon seed continues to use stable text IDs and a service-role client.
-- Service-role requests bypass RLS; browser-session requests are limited by the
-- policies below. No existing canonical demo row needs an auth user to remain
-- valid, because the new auth linkage columns are intentionally nullable.

do $$
begin
  create type public.app_role as enum ('student', 'teacher');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A teacher has a stable application ID for class ownership, while auth_user_id
-- links that record to the Supabase account that is allowed to manage it.
create table if not exists public.teachers (
  id text primary key check (length(trim(id)) > 0),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);

alter table public.students
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

alter table public.classes
  add column if not exists teacher_id text references public.teachers(id) on delete set null;

create index if not exists students_by_auth_user_id
  on public.students (auth_user_id)
  where auth_user_id is not null;

create index if not exists teachers_by_auth_user_id
  on public.teachers (auth_user_id)
  where auth_user_id is not null;

create index if not exists classes_by_teacher_id
  on public.classes (teacher_id)
  where teacher_id is not null;

-- Use app_metadata, rather than user_metadata, for the initial role. Only a
-- trusted server/admin may set app_metadata, preventing client role escalation.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role public.app_role;
begin
  requested_role := case new.raw_app_meta_data ->> 'role'
    when 'teacher' then 'teacher'::public.app_role
    else 'student'::public.app_role
  end;

  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    requested_role,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- SECURITY DEFINER helpers read the ownership graph without recursively
-- invoking RLS. Their only output is a boolean for the active auth.uid().
create or replace function public.current_user_is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'teacher'::public.app_role
  );
$$;

create or replace function public.student_owns(target_student_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.students student
    where student.id = target_student_id
      and student.auth_user_id = auth.uid()
  );
$$;

create or replace function public.teacher_owns_class(target_class_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_teacher()
    and exists (
      select 1
      from public.classes class
      join public.teachers teacher on teacher.id = class.teacher_id
      where class.id = target_class_id
        and teacher.auth_user_id = auth.uid()
    );
$$;

create or replace function public.student_is_enrolled_in_class(target_class_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_enrollments enrollment
    join public.students student on student.id = enrollment.student_id
    where enrollment.class_id = target_class_id
      and student.auth_user_id = auth.uid()
  );
$$;

create or replace function public.teacher_can_access_student(target_student_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_teacher()
    and exists (
      select 1
      from public.class_enrollments enrollment
      join public.classes class on class.id = enrollment.class_id
      join public.teachers teacher on teacher.id = class.teacher_id
      where enrollment.student_id = target_student_id
        and teacher.auth_user_id = auth.uid()
    );
$$;

create or replace function public.can_access_class(target_class_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.teacher_owns_class(target_class_id)
      or public.student_is_enrolled_in_class(target_class_id);
$$;

create or replace function public.can_access_assignment(target_assignment_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments assignment
    where assignment.id = target_assignment_id
      and public.can_access_class(assignment.class_id)
  );
$$;

create or replace function public.can_access_practice_session(target_session_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_sessions session
    where session.id = target_session_id
      and (
        public.student_owns(session.student_id)
        or public.teacher_can_access_student(session.student_id)
      )
  );
$$;

create or replace function public.teacher_owns_group(target_group_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_groups teacher_group
    where teacher_group.id = target_group_id
      and public.teacher_owns_class(teacher_group.class_id)
  );
$$;

revoke all on function public.current_user_is_teacher() from public;
revoke all on function public.student_owns(text) from public;
revoke all on function public.teacher_owns_class(text) from public;
revoke all on function public.student_is_enrolled_in_class(text) from public;
revoke all on function public.teacher_can_access_student(text) from public;
revoke all on function public.can_access_class(text) from public;
revoke all on function public.can_access_assignment(text) from public;
revoke all on function public.can_access_practice_session(text) from public;
revoke all on function public.teacher_owns_group(text) from public;

grant execute on function public.current_user_is_teacher() to authenticated;
grant execute on function public.student_owns(text) to authenticated;
grant execute on function public.teacher_owns_class(text) to authenticated;
grant execute on function public.student_is_enrolled_in_class(text) to authenticated;
grant execute on function public.teacher_can_access_student(text) to authenticated;
grant execute on function public.can_access_class(text) to authenticated;
grant execute on function public.can_access_assignment(text) to authenticated;
grant execute on function public.can_access_practice_session(text) to authenticated;
grant execute on function public.teacher_owns_group(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.topics enable row level security;
alter table public.subskills enable row level security;
alter table public.items enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_items enable row level security;
alter table public.student_responses enable row level security;
alter table public.mastery enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_session_items enable row level security;
alter table public.attempt_submissions enable row level security;
alter table public.peer_solutions enable row level security;
alter table public.peer_unlocks enable row level security;
alter table public.video_recommendations enable row level security;
alter table public.teacher_groups enable row level security;
alter table public.teacher_group_members enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.ai_runs enable row level security;

-- Profiles are readable only by the signed-in identity. Profile creation and
-- role changes run through the auth trigger or a trusted server, never browser
-- policies, so a client cannot promote itself to teacher.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy teachers_select_own on public.teachers
  for select to authenticated using (auth_user_id = auth.uid());

-- Students can see only their own record. A teacher can see students only when
-- they share one of that teacher's owned classes.
create policy students_select_self_or_owned_class on public.students
  for select to authenticated
  using (public.student_owns(id) or public.teacher_can_access_student(id));

create policy classes_select_owned_or_enrolled on public.classes
  for select to authenticated using (public.can_access_class(id));

create policy class_enrollments_select_own_or_owned_class on public.class_enrollments
  for select to authenticated
  using (public.student_owns(student_id) or public.teacher_owns_class(class_id));

create policy class_enrollments_insert_owned_class on public.class_enrollments
  for insert to authenticated with check (public.teacher_owns_class(class_id));

create policy class_enrollments_delete_owned_class on public.class_enrollments
  for delete to authenticated using (public.teacher_owns_class(class_id));

-- Curriculum metadata is safe to read, but answer-bearing `items` stay behind
-- server routes so a learner cannot fetch answer_spec or solution_steps.
create policy topics_read_authenticated on public.topics
  for select to authenticated using (true);

create policy subskills_read_authenticated on public.subskills
  for select to authenticated using (true);

create policy items_read_teachers_only on public.items
  for select to authenticated using (public.current_user_is_teacher());

create policy assignments_select_owned_or_enrolled on public.assignments
  for select to authenticated using (public.can_access_class(class_id));

create policy assignment_items_select_visible_assignment on public.assignment_items
  for select to authenticated using (public.can_access_assignment(assignment_id));

-- A learner may write/read only their own work. Their teacher gets read access
-- only through an owned class; server-side workflows make derived updates.
create policy responses_select_self_or_owned_class on public.student_responses
  for select to authenticated
  using (public.student_owns(student_id) or public.teacher_can_access_student(student_id));

create policy responses_insert_self on public.student_responses
  for insert to authenticated with check (public.student_owns(student_id));

create policy mastery_select_self_or_owned_class on public.mastery
  for select to authenticated
  using (public.student_owns(student_id) or public.teacher_can_access_student(student_id));

create policy practice_sessions_select_self_or_owned_class on public.practice_sessions
  for select to authenticated
  using (public.student_owns(student_id) or public.teacher_can_access_student(student_id));

create policy practice_session_items_select_visible_session on public.practice_session_items
  for select to authenticated using (public.can_access_practice_session(practice_session_id));

create policy attempts_select_self_or_owned_class on public.attempt_submissions
  for select to authenticated
  using (public.student_owns(student_id) or public.teacher_can_access_student(student_id));

create policy attempts_insert_self on public.attempt_submissions
  for insert to authenticated with check (public.student_owns(student_id));

-- Full peer solutions are gated server-side. Browser sessions never receive the
-- underlying table directly, even after an unlock; the route projects only the
-- allowed approach/full-solution fields.
create policy peer_unlocks_select_self_or_owned_class on public.peer_unlocks
  for select to authenticated
  using (public.student_owns(student_id) or public.teacher_can_access_student(student_id));

create policy videos_read_authenticated on public.video_recommendations
  for select to authenticated using (is_active);

-- Teacher aggregates and plans are visible only to the teacher who owns the
-- class. Students cannot query class heatmaps, group membership, or plans.
create policy teacher_groups_select_owned_class on public.teacher_groups
  for select to authenticated using (public.teacher_owns_class(class_id));

create policy teacher_group_members_select_owned_group on public.teacher_group_members
  for select to authenticated using (public.teacher_owns_group(teacher_group_id));

create policy lesson_plans_select_owned_group on public.lesson_plans
  for select to authenticated using (public.teacher_owns_group(teacher_group_id));

-- No browser policy is created for ai_runs, peer_solutions, or any mutation of
-- derived learning data. Trusted server code/service role owns those writes.
