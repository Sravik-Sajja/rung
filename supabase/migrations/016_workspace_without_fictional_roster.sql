-- A teacher workspace no longer ships a fictional roster.
--
-- The workspace seeded six fictional students so a fresh heatmap looked
-- populated. Once real students could join, they landed in the same table under
-- a "Fictional student" header, mixing invented evidence with real work. A
-- workspace now starts empty and fills only as students actually join.
--
-- Existing fictional rosters are removed here. `students` is referenced by
-- `mastery` and `class_enrollments` without `on delete cascade`, so children go
-- first. Joined learners use the `teacher-demo-learner-` and `demo-learner-`
-- prefixes and are untouched by this.
delete from public.mastery
  where student_id like 'teacher-demo-student-%';

delete from public.class_enrollments
  where student_id like 'teacher-demo-student-%';

delete from public.teacher_group_members
  where student_id like 'teacher-demo-student-%';

delete from public.students
  where id like 'teacher-demo-student-%';

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

  insert into public.teacher_demo_sessions (teacher_id, class_id, assignment_id, token_hash, join_code, expires_at)
  values (v_teacher_id, v_class_id, v_assignment_id, p_token_hash, p_join_code, p_expires_at);
  return query select v_class_id, v_assignment_id, v_class_name, v_teacher_name, p_expires_at;
end;
$$;

revoke all on function public.create_teacher_demo_workspace(text, text, text, text, timestamptz) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_teacher_demo_workspace(text, text, text, text, timestamptz) to service_role;
  end if;
end $$;
