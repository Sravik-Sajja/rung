-- Give every diagnostic session its own five items.
--
-- Until now the persisted diagnostic served the five canonical seeded rows that
-- `assignment_items` points at, and every teacher workspace pointed at those same
-- five. So a learner who sat the check-in, joined another class, and sat it again
-- was asked the identical five questions. The per-learner question bank in
-- `src/lib/items/diagnostic-items.ts` already existed but was reachable only from
-- the in-memory demo store, never from Postgres.
--
-- The items must be written down rather than re-derived on read. Teacher evidence
-- joins `student_responses.item_id -> items`, so a generated prompt that lived
-- only in the server's memory would leave the teacher reading the seeded row --
-- same id, different numbers, no error. Persisting the generated item is what
-- keeps the student's question, the scorer's answer key, and the teacher's view
-- the same object.
--
-- Mirrors `generated_practice_items` (006): mint a per-learner id, insert it
-- inactive, and link it to the session that owns it.

create table if not exists public.diagnostic_session_items (
  diagnostic_session_id uuid not null references public.diagnostic_sessions(id) on delete cascade,
  item_id text not null references public.items(id) on delete cascade,
  position integer not null check (position between 1 and 5),
  slot_id text not null,
  created_at timestamptz not null default now(),
  primary key (diagnostic_session_id, item_id),
  unique (diagnostic_session_id, position)
);

create index if not exists diagnostic_session_items_session_idx
  on public.diagnostic_session_items (diagnostic_session_id, position);

alter table public.diagnostic_session_items enable row level security;

-- Deny-by-default for `authenticated`, matching `items` itself. Every read and
-- write goes through the service role, which owns scoring and must not be
-- reachable from a browser session.

-- Materializes one learner's five diagnostic items inside a single transaction.
-- Idempotent: a session that already has items returns without a second insert,
-- so a retried start never mints a duplicate set or reshuffles a session the
-- learner is partway through.
--
-- p_items shape:
-- [{ id, slotId, subskillId, itemType, prompt, answerSpec, distractorMap,
--    visualSpec?, difficulty }]
create or replace function public.materialize_diagnostic_session_items(
  p_diagnostic_session_id uuid,
  p_student_id text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.diagnostic_sessions%rowtype;
  v_item jsonb;
  v_position integer;
begin
  -- Lock before the existence check so concurrent starts serialize here rather
  -- than both deciding the session is empty and racing to fill it.
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
    from public.diagnostic_session_items existing
    where existing.diagnostic_session_id = p_diagnostic_session_id
  ) then
    return;
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Diagnostic session % needs at least one item', p_diagnostic_session_id;
  end if;

  v_position := 0;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_position := v_position + 1;

    if coalesce(v_item ->> 'id', '') = ''
      or coalesce(v_item ->> 'slotId', '') = ''
      or coalesce(v_item ->> 'subskillId', '') = ''
      or coalesce(v_item ->> 'prompt', '') = ''
      or coalesce(jsonb_typeof(v_item -> 'answerSpec'), '') <> 'object' then
      raise exception 'Diagnostic item % is missing required fields', v_position;
    end if;

    insert into public.items (
      id,
      subskill_id,
      item_type,
      prompt,
      answer_spec,
      difficulty,
      -- Inactive for the same reason generated practice items are: this item
      -- belongs to one session, and no static selection query may serve another
      -- learner somebody else's numbers.
      is_active,
      distractor_map,
      visual_spec
    ) values (
      v_item ->> 'id',
      v_item ->> 'subskillId',
      coalesce(nullif(v_item ->> 'itemType', ''), 'generated_diagnostic'),
      v_item ->> 'prompt',
      v_item -> 'answerSpec',
      coalesce((nullif(v_item ->> 'difficulty', ''))::integer, 1),
      false,
      coalesce(v_item -> 'distractorMap', '{}'::jsonb),
      case when jsonb_typeof(v_item -> 'visualSpec') = 'object' then v_item -> 'visualSpec' else null end
    );

    insert into public.diagnostic_session_items (
      diagnostic_session_id,
      item_id,
      position,
      slot_id
    ) values (
      p_diagnostic_session_id,
      v_item ->> 'id',
      v_position,
      v_item ->> 'slotId'
    );
  end loop;
end;
$$;

revoke all on function public.materialize_diagnostic_session_items(uuid, text, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.materialize_diagnostic_session_items(uuid, text, jsonb) to service_role;
  end if;
end;
$$;

-- Rebind the mastery finalizer to the session's own items.
--
-- The previous body joined responses against `assignment_items`. A per-session
-- item id is not in that table, so every response would fail the join, no
-- evidence rows would be grouped, and the finalizer would write zero mastery --
-- silently, leaving the teacher heatmap blank with no error anywhere. This is
-- the one change without which per-session items break the product.
--
-- Sessions created before this migration have no `diagnostic_session_items`
-- rows, so the assignment-scoped list stays as the fallback for exactly those.
--
-- Everything else is carried forward verbatim from 014: the class is still
-- derived from the session's own assignment and never taken from the caller,
-- and mastery is still written class-scoped. Only the `administered` CTE and
-- its join are new.
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
  v_class_id text;
begin
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

  select assignment.class_id
    into v_class_id
    from public.assignments assignment
    where assignment.id = v_session.assignment_id;

  if v_class_id is null then
    raise exception 'Diagnostic session % has no owning class', p_diagnostic_session_id;
  end if;

  if not exists (
    select 1 from public.class_enrollments enrollment
    where enrollment.class_id = v_class_id and enrollment.student_id = v_session.student_id
  ) then
    raise exception 'Student % is not enrolled in the class that owns this diagnostic', v_session.student_id;
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

  with administered as (
    select session_item.item_id
      from public.diagnostic_session_items session_item
      where session_item.diagnostic_session_id = p_diagnostic_session_id
    union all
    -- Pre-migration sessions only. Suppressed the moment the session owns items.
    select assignment_item.item_id
      from public.assignment_items assignment_item
      where assignment_item.assignment_id = v_session.assignment_id
        and not exists (
          select 1
          from public.diagnostic_session_items session_item
          where session_item.diagnostic_session_id = p_diagnostic_session_id
        )
  ), latest_responses as (
    select distinct on (response.item_id)
      response.item_id,
      response.is_correct
    from public.student_responses response
    join administered on administered.item_id = response.item_id
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
    class_id,
    subskill_id,
    level,
    evidence_count,
    evidence_summary,
    last_evaluated_at
  )
  select
    v_session.student_id,
    v_class_id,
    evidence.subskill_id,
    case when evidence.all_correct then 'developing' else 'needs_support' end,
    evidence.response_count,
    case
      when evidence.all_correct then 'Diagnostic response recorded correctly.'
      else 'Diagnostic response recorded incorrectly; focused support is recommended.'
    end,
    now()
  from evidence_by_subskill evidence
  on conflict (student_id, class_id, subskill_id) do update
    set level = case
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

  return public.finalize_generated_diagnostic_completion_base(
    p_diagnostic_session_id,
    p_student_id,
    p_completion,
    p_plans
  );
end;
$$;

revoke all on function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb)
      to service_role;
  end if;
end;
$$;
