-- Let a workspace owner remove a student from their class.
--
-- Removal is scoped to one class. The learner's `students` row survives, so a
-- public walkthrough participant keeps the climb they started before joining;
-- only what they did in this class is purged. Rejoining with the code therefore
-- gives a clean slate rather than restoring a half-finished check-in.
--
-- The caller passes the class it owns, resolved server-side from the workspace
-- cookie. Nothing here lets a caller name a class it does not hold.
create or replace function public.remove_teacher_demo_workspace_student(
  p_class_id text, p_student_id text
) returns table (removed_student_id text)
language plpgsql security definer set search_path = '' as $$
declare
  v_diagnostic_ids uuid[];
  v_practice_ids text[];
begin
  if not exists (
    select 1 from public.class_enrollments enrollment
    where enrollment.class_id = p_class_id and enrollment.student_id = p_student_id
  ) then
    raise exception 'That student is not in this class.';
  end if;

  -- Only work that belongs to this class. A learner's answers reach a class
  -- solely through the diagnostic session that owns them.
  select coalesce(array_agg(session.id), '{}') into v_diagnostic_ids
  from public.diagnostic_sessions session
  join public.assignments assignment on assignment.id = session.assignment_id
  where assignment.class_id = p_class_id and session.student_id = p_student_id;

  select coalesce(array_agg(practice.id), '{}') into v_practice_ids
  from public.practice_sessions practice
  where practice.diagnostic_session_id = any (v_diagnostic_ids);

  -- practice_session_items does not cascade from practice_sessions, and
  -- practice_sessions only SET NULL from diagnostic_sessions, so the practice
  -- rows must go before the diagnostics that identify them.
  delete from public.practice_session_items where practice_session_id = any (v_practice_ids);
  delete from public.practice_sessions where id = any (v_practice_ids);
  -- Cascades student_responses and diagnostic_completions.
  delete from public.diagnostic_sessions where id = any (v_diagnostic_ids);

  delete from public.mastery where student_id = p_student_id and class_id = p_class_id;
  delete from public.teacher_group_members
    where student_id = p_student_id
      and teacher_group_id in (select id from public.teacher_groups where class_id = p_class_id);
  delete from public.class_enrollments where student_id = p_student_id and class_id = p_class_id;

  -- Ends the learner's capability for this class immediately. Session
  -- resolution also re-checks enrollment, so this is belt and braces.
  update public.teacher_demo_student_sessions existing
    set revoked_at = now()
    where existing.student_id = p_student_id
      and existing.class_id = p_class_id
      and existing.revoked_at is null;

  return query select p_student_id;
end;
$$;

revoke all on function public.remove_teacher_demo_workspace_student(text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.remove_teacher_demo_workspace_student(text, text) to service_role;
  end if;
end $$;
