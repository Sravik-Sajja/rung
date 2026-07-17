-- Purge a removed learner's generated diagnostic items along with their sessions.
--
-- 018 gave every diagnostic session its own five `items` rows. `remove_teacher_
-- demo_workspace_student` deletes the session, which cascades the
-- `diagnostic_session_items` link but leaves the `items` rows themselves behind:
-- inactive, unreferenced, and permanent. Nothing breaks -- no response can point
-- at them, since responses die with the session -- but the row count climbs with
-- every removal and never falls.
--
-- Same reasoning `remove_teacher_demo_workspace_student` already applies to
-- practice rows, and the same reasoning the seed applies to generated practice
-- items: a generated item belongs to its session and has no life without it.
--
-- The ids must be collected before the session goes, because the link rows that
-- name them are exactly what the cascade removes.
create or replace function public.remove_teacher_demo_workspace_student(
  p_class_id text, p_student_id text
) returns table (removed_student_id text)
language plpgsql security definer set search_path = '' as $$
declare
  v_diagnostic_ids uuid[];
  v_practice_ids text[];
  v_generated_item_ids text[];
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

  -- Collected before the delete below: the link rows naming these items are the
  -- first casualty of the session cascade, and after that the items are
  -- unreachable.
  select coalesce(array_agg(link.item_id), '{}') into v_generated_item_ids
  from public.diagnostic_session_items link
  where link.diagnostic_session_id = any (v_diagnostic_ids);

  -- practice_session_items does not cascade from practice_sessions, and
  -- practice_sessions only SET NULL from diagnostic_sessions, so the practice
  -- rows must go before the diagnostics that identify them.
  delete from public.practice_session_items where practice_session_id = any (v_practice_ids);
  delete from public.practice_sessions where id = any (v_practice_ids);
  -- Cascades student_responses, diagnostic_completions, and the session's items.
  delete from public.diagnostic_sessions where id = any (v_diagnostic_ids);

  -- Now that no response or link references them, the generated items go too.
  -- Guarded on item_type so a seeded canonical row can never be caught here,
  -- however a future caller wires this up.
  delete from public.items
    where id = any (v_generated_item_ids)
      and item_type = 'generated_diagnostic';

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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.remove_teacher_demo_workspace_student(text, text) to service_role;
  end if;
end;
$$;

-- One-time sweep of the items 018 already stranded, including any left by this
-- function before the fix above. Scoped by item_type and by having no link row,
-- so it can only ever match a generated diagnostic item whose session is gone.
delete from public.items item
  where item.item_type = 'generated_diagnostic'
    and not exists (
      select 1 from public.diagnostic_session_items link where link.item_id = item.id
    )
    and not exists (
      select 1 from public.student_responses response where response.item_id = item.id
    );
