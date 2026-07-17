-- Let an existing public walkthrough learner join a teacher workspace without
-- becoming a second learner.
--
-- `join_teacher_demo_workspace` mints a new `teacher-demo-learner-*` student,
-- which stranded the walkthrough identity the visitor already had. This variant
-- reuses the caller's student, adds the enrollment, and opens a class-scoped
-- mastery matrix. Because 014 keys mastery by class, the walkthrough matrix is
-- untouched and the teacher sees only work done in their own class.
--
-- The student id must come from the server's own resolved participant cookie.
-- The active-session predicate below is defence in depth: it makes a live
-- walkthrough participant the only kind of student this path can ever enroll,
-- so a malformed caller cannot enroll a seeded roster student into a class it
-- merely holds a join code for.
create or replace function public.join_teacher_demo_workspace_as_participant(
  p_join_code text, p_student_id text, p_token_hash text, p_expires_at timestamptz
) returns table (student_id text, display_name text, grade_band text, class_id text, assignment_id text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.teacher_demo_sessions%rowtype;
  v_student public.students%rowtype;
  v_expiry timestamptz;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Joined student session token is invalid.'; end if;
  if coalesce(p_join_code, '') !~ '^[A-F0-9]{4}(-[A-F0-9]{4}){2}$' then raise exception 'Join code is invalid.'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then raise exception 'Joined student expiry must be within the next 24 hours.'; end if;

  select student.* into v_student from public.students student where student.id = p_student_id;
  if not found then raise exception 'That learner no longer exists. Start a new climb to continue.'; end if;

  if not exists (
    select 1 from public.demo_participant_sessions participant
    where participant.student_id = p_student_id and participant.expires_at > now()
  ) then
    raise exception 'Only an active walkthrough learner can join a class with an existing session.';
  end if;

  select session.* into v_session from public.teacher_demo_sessions session
    where session.join_code = p_join_code and session.revoked_at is null and session.expires_at > now() for update;
  if not found then raise exception 'That join code is not active.'; end if;

  if not exists (
    select 1 from public.assignments assignment
    where assignment.id = v_session.assignment_id and assignment.class_id = v_session.class_id and assignment.mode = 'diagnostic'
  ) then
    raise exception 'The joined assignment does not belong to this class.';
  end if;

  v_expiry := least(p_expires_at, v_session.expires_at);

  -- Conflict targets name the constraint rather than its columns: this
  -- function's OUT parameters are also called class_id and student_id, and a
  -- bare column list in `on conflict` resolves to those instead.
  insert into public.class_enrollments (class_id, student_id)
  values (v_session.class_id, p_student_id)
  on conflict on constraint class_enrollments_pkey do nothing;

  -- A fresh matrix for this class only. `do nothing` makes a rejoin idempotent
  -- rather than resetting work already done in this class.
  insert into public.mastery (student_id, class_id, subskill_id, level, evidence_count, evidence_summary, last_evaluated_at)
    select p_student_id, v_session.class_id, skill.id, 'not_started', 0, 'Joined this class and has not submitted work yet.', now()
    from public.subskills skill
    join public.assignments assignment on assignment.topic_id = skill.topic_id
    where assignment.id = v_session.assignment_id and assignment.class_id = v_session.class_id
  on conflict on constraint mastery_pkey do nothing;

  -- Supersede any earlier live session this learner holds for the same class so
  -- rejoining cannot accumulate parallel capabilities.
  update public.teacher_demo_student_sessions existing
    set revoked_at = now()
    where existing.student_id = p_student_id
      and existing.class_id = v_session.class_id
      and existing.revoked_at is null;

  insert into public.teacher_demo_student_sessions (teacher_demo_session_id, student_id, class_id, assignment_id, token_hash, expires_at)
  values (v_session.id, p_student_id, v_session.class_id, v_session.assignment_id, p_token_hash, v_expiry);

  return query select v_student.id, v_student.display_name, coalesce(v_student.grade_band, '6-8'), v_session.class_id, v_session.assignment_id, v_expiry;
end;
$$;

-- Resolve a join code to its class for the confirm screen. Returns only what
-- the screen renders; a caller already holds the code, so this reveals nothing
-- it could not learn by joining.
create or replace function public.preview_teacher_demo_workspace(p_join_code text)
returns table (class_name text, teacher_display_name text, assignment_title text)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(p_join_code, '') !~ '^[A-F0-9]{4}(-[A-F0-9]{4}){2}$' then raise exception 'Join code is invalid.'; end if;
  return query
    select class.name, class.teacher_display_name, assignment.title
    from public.teacher_demo_sessions session
    join public.classes class on class.id = session.class_id
    join public.assignments assignment on assignment.id = session.assignment_id
    where session.join_code = p_join_code
      and session.revoked_at is null
      and session.expires_at > now();
end;
$$;

revoke all on function public.join_teacher_demo_workspace_as_participant(text, text, text, timestamptz) from public;
revoke all on function public.preview_teacher_demo_workspace(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.join_teacher_demo_workspace_as_participant(text, text, text, timestamptz) to service_role;
    grant execute on function public.preview_teacher_demo_workspace(text) to service_role;
  end if;
end $$;
