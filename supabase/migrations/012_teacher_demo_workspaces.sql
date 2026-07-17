-- Isolated non-production teacher workspace. This is not Supabase Auth and
-- none of these session records participate in the public walkthrough.
create table if not exists public.teacher_demo_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null references public.teachers(id) on delete cascade,
  class_id text not null unique references public.classes(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists teacher_demo_sessions_expiry_idx on public.teacher_demo_sessions (expires_at) where revoked_at is null;
alter table public.teacher_demo_sessions enable row level security;
-- No policies: only the trusted service role reaches this table.

create or replace function public.create_teacher_demo_workspace(
  p_teacher_display_name text, p_class_name text, p_token_hash text, p_expires_at timestamptz
) returns table (class_id text, class_name text, teacher_display_name text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_teacher_name text := btrim(coalesce(p_teacher_display_name, ''));
  v_class_name text := btrim(coalesce(p_class_name, ''));
  v_teacher_id text := 'teacher-demo-' || replace(gen_random_uuid()::text, '-', '');
  v_class_id text := 'teacher-demo-class-' || replace(gen_random_uuid()::text, '-', '');
  v_student_id text;
  v_roster text[] := array['Avery Chen', 'Diego Morales', 'Imani Brooks', 'Noah Patel', 'Sofia Williams', 'Theo Nguyen'];
  v_student_name text;
  v_index int := 0;
  v_level text;
begin
  if length(v_teacher_name) < 1 or length(v_teacher_name) > 48 then raise exception 'Teacher display name must be 1 to 48 characters.'; end if;
  if length(v_class_name) < 1 or length(v_class_name) > 80 then raise exception 'Class name must be 1 to 80 characters.'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Teacher workspace session token is invalid.'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then raise exception 'Teacher workspace expiry must be within the next 24 hours.'; end if;
  if not exists (select 1 from public.subskills) then raise exception 'Teacher workspace needs seeded curriculum subskills.'; end if;

  insert into public.teachers (id, display_name) values (v_teacher_id, v_teacher_name);
  insert into public.classes (id, name, teacher_display_name, teacher_id) values (v_class_id, v_class_name, v_teacher_name, v_teacher_id);
  foreach v_student_name in array v_roster loop
    v_index := v_index + 1;
    v_student_id := 'teacher-demo-student-' || replace(gen_random_uuid()::text, '-', '');
    insert into public.students (id, display_name, grade_band, is_demo_default) values (v_student_id, v_student_name, case when v_index <= 3 then '6' else '7' end, false);
    insert into public.class_enrollments (class_id, student_id) values (v_class_id, v_student_id);
    insert into public.mastery (student_id, subskill_id, level, evidence_count, evidence_summary, last_evaluated_at)
      select v_student_id, skill.id,
        (array['developing', 'needs_support', 'mastered', 'developing', 'not_started', 'needs_support'])[((v_index + row_number() over (order by skill.id)::int - 2) % 6) + 1],
        1, 'Fictional starter evidence for this temporary workspace.', now()
      from public.subskills skill;
  end loop;
  insert into public.teacher_demo_sessions (teacher_id, class_id, token_hash, expires_at) values (v_teacher_id, v_class_id, p_token_hash, p_expires_at);
  return query select v_class_id, v_class_name, v_teacher_name, p_expires_at;
end;
$$;
revoke all on function public.create_teacher_demo_workspace(text, text, text, timestamptz) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.create_teacher_demo_workspace(text, text, text, timestamptz) to service_role; end if; end $$;
