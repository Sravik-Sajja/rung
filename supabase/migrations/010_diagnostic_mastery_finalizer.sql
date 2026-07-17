-- Derive diagnostic mastery from the durable response rows at completion time.
--
-- The previous finalizer already owns the session lock, completion record, and
-- generated practice materialization. Rename it to a private implementation
-- and place a small locked wrapper in front of it so the mastery write occurs
-- in the same transaction. The wrapper deliberately never inspects the
-- client-supplied completion JSON for correctness or evidence.
alter function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb)
  rename to finalize_generated_diagnostic_completion_base;

create or replace function public.finalize_generated_diagnostic_completion(
  p_diagnostic_session_id uuid,
  p_student_id text,
  p_completion jsonb,
  p_plans jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.diagnostic_sessions%rowtype;
begin
  -- Lock before checking completion or reading responses. Concurrent retries
  -- serialize here; a retry sees the durable completion and makes no second
  -- mastery/evidence write.
  select *
    into v_session
    from public.diagnostic_sessions
    where id = p_diagnostic_session_id
    for update;

  if not found then
    raise exception 'Diagnostic session % was not found', p_diagnostic_session_id;
  end if;

  if v_session.student_id <> p_student_id then
    raise exception 'Diagnostic session does not belong to the requested student';
  end if;

  if exists (
    select 1
    from public.diagnostic_completions completion
    where completion.diagnostic_session_id = p_diagnostic_session_id
  ) then
    return public.finalize_generated_diagnostic_completion_base(
      p_diagnostic_session_id,
      p_student_id,
      p_completion,
      p_plans
    );
  end if;

  -- Select only the newest server-scored response for each item that belongs
  -- to this diagnostic assignment. `is_correct` was calculated by the trusted
  -- response service, not accepted from the browser completion payload.
  with latest_responses as (
    select distinct on (response.item_id)
      response.item_id,
      response.is_correct
    from public.student_responses response
    join public.assignment_items assignment_item
      on assignment_item.assignment_id = v_session.assignment_id
      and assignment_item.item_id = response.item_id
    where response.diagnostic_session_id = p_diagnostic_session_id
      and response.student_id = v_session.student_id
      and response.context = 'diagnostic'
    order by response.item_id, response.submitted_at desc, response.id desc
  ), evidence_by_subskill as (
    select
      item.subskill_id,
      bool_and(latest_responses.is_correct) as all_correct,
      count(*)::integer as response_count
    from latest_responses
    join public.items item on item.id = latest_responses.item_id
    group by item.subskill_id
  )
  insert into public.mastery (
    student_id,
    subskill_id,
    level,
    evidence_count,
    evidence_summary,
    last_evaluated_at
  )
  select
    v_session.student_id,
    evidence.subskill_id,
    case when evidence.all_correct then 'developing' else 'needs_support' end,
    evidence.response_count,
    case
      when evidence.all_correct then 'Diagnostic response recorded correctly.'
      else 'Diagnostic response recorded incorrectly; focused support is recommended.'
    end,
    now()
  from evidence_by_subskill evidence
  on conflict (student_id, subskill_id) do update
    set level = case
          -- Diagnostics never demote a mastered skill or promote directly to
          -- mastered. All other levels reflect the latest diagnostic result.
          when public.mastery.level = 'mastered' then 'mastered'
          when excluded.level = 'needs_support' then 'needs_support'
          else 'developing'
        end,
        evidence_count = coalesce(public.mastery.evidence_count, 0) + excluded.evidence_count,
        evidence_summary = case
          when excluded.level = 'needs_support' then excluded.evidence_summary
          when public.mastery.level = 'mastered' then public.mastery.evidence_summary
          else excluded.evidence_summary
        end,
        last_evaluated_at = now();

  -- The original function validates the caller's completion/plan payload and
  -- materializes practice. Any error there rolls this mastery write back too.
  return public.finalize_generated_diagnostic_completion_base(
    p_diagnostic_session_id,
    p_student_id,
    p_completion,
    p_plans
  );
end;
$$;

-- Only the wrapper remains callable by the trusted service role. The renamed
-- implementation is an internal detail, preventing any bypass of the derived
-- mastery write.
revoke all on function public.finalize_generated_diagnostic_completion_base(uuid, text, jsonb, jsonb)
  from public;
revoke all on function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb)
  from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb)
      to service_role;
  end if;
end;
$$;
