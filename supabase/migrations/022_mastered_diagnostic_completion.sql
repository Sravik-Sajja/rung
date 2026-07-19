-- A learner who has already mastered every assessed skill should complete the
-- check-in without receiving an invented fallback practice plan. This RPC
-- records that outcome atomically and proves it from stored class mastery.
create or replace function public.finalize_mastered_diagnostic_completion(
  p_diagnostic_session_id uuid,
  p_student_id text,
  p_completion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.diagnostic_sessions%rowtype;
  v_class_id text;
begin
  if coalesce(jsonb_typeof(p_completion), '') <> 'object' then
    raise exception 'Completion must be a JSON object';
  end if;

  select * into v_session from public.diagnostic_sessions where id = p_diagnostic_session_id for update;
  if not found or v_session.student_id <> p_student_id then
    raise exception 'Diagnostic session is unavailable.';
  end if;

  if exists (select 1 from public.diagnostic_completions where diagnostic_session_id = p_diagnostic_session_id) then
    return jsonb_build_object('created', false, 'diagnosticSessionId', p_diagnostic_session_id, 'practicePlanIds', '[]'::jsonb);
  end if;
  if v_session.status <> 'active' then raise exception 'Diagnostic session is already complete.'; end if;

  select class_id into v_class_id from public.assignments where id = v_session.assignment_id;
  if v_class_id is null or not exists (
    select 1 from public.class_enrollments where class_id = v_class_id and student_id = p_student_id
  ) then raise exception 'Student is not enrolled in this diagnostic class.'; end if;

  if exists (
    with administered as (
      select item_id from public.diagnostic_session_items where diagnostic_session_id = p_diagnostic_session_id
      union all
      select item_id from public.assignment_items where assignment_id = v_session.assignment_id
        and not exists (select 1 from public.diagnostic_session_items where diagnostic_session_id = p_diagnostic_session_id)
    )
    select 1 from (select distinct item.subskill_id from administered join public.items item on item.id = administered.item_id) skills
    left join public.mastery mastery on mastery.student_id = p_student_id and mastery.class_id = v_class_id and mastery.subskill_id = skills.subskill_id
    where mastery.level is distinct from 'mastered'
  ) then raise exception 'Not every assessed skill is mastered.'; end if;

  insert into public.diagnostic_completions (
    diagnostic_session_id, selected_subskill_id, misconception_tag, evidence, observation, explanation, next_step, explanation_source, explanation_ai_run_ref, completion_version
  ) values (
    p_diagnostic_session_id, p_completion ->> 'selectedSubskillId', p_completion ->> 'misconceptionTag',
    coalesce(p_completion -> 'evidence', '[]'::jsonb), p_completion ->> 'observation', p_completion ->> 'explanation',
    p_completion ->> 'nextStep', p_completion ->> 'explanationSource', nullif(p_completion ->> 'explanationAiRunRef', ''), p_completion ->> 'completionVersion'
  );
  update public.diagnostic_sessions set status = 'complete', completed_at = now() where id = p_diagnostic_session_id;
  return jsonb_build_object('created', true, 'diagnosticSessionId', p_diagnostic_session_id, 'practicePlanIds', '[]'::jsonb);
end;
$$;

revoke all on function public.finalize_mastered_diagnostic_completion(uuid, text, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.finalize_mastered_diagnostic_completion(uuid, text, jsonb) to service_role;
  end if;
end $$;
