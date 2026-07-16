-- Durable, idempotent storage for the generated-practice path.
--
-- The application validates the parametric item grammar and derives answers
-- before calling the finalizer below. This migration deliberately contains no
-- model invocation, prompt construction, or learner-answer scoring.

alter table public.practice_sessions
  add column if not exists diagnostic_session_id uuid
    references public.diagnostic_sessions(id) on delete set null,
  add column if not exists completed_at timestamptz;

-- Existing installations may contain legacy values. NOT VALID enforces the
-- intended lifecycle for all new or changed rows without making this forward
-- migration fail on historical demo data.
alter table public.practice_sessions
  drop constraint if exists practice_sessions_status_check;

alter table public.practice_sessions
  add constraint practice_sessions_status_check
  check (status in ('active', 'complete')) not valid;

create table if not exists public.diagnostic_completions (
  diagnostic_session_id uuid primary key
    references public.diagnostic_sessions(id) on delete cascade,
  selected_subskill_id text not null references public.subskills(id),
  misconception_tag text not null,
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  observation text not null check (length(trim(observation)) > 0),
  explanation text not null check (length(trim(explanation)) > 0),
  next_step text not null check (length(trim(next_step)) > 0),
  explanation_source text not null
    check (explanation_source in ('ai', 'cache', 'fallback')),
  -- This is intentionally a text reference: a safe fallback can still be
  -- persisted if ai_runs logging is temporarily unavailable and returns an
  -- in-memory run identifier rather than a UUID.
  explanation_ai_run_ref text,
  completion_version text not null check (length(trim(completion_version)) > 0),
  created_at timestamptz not null default now()
);

-- A plan's ID is deliberately the practice-session ID. The existing student
-- route can therefore continue to use /student/practice/:sessionId without a
-- plan-ID-to-session-ID translation layer.
create table if not exists public.practice_plans (
  id text primary key references public.practice_sessions(id) on delete cascade,
  diagnostic_session_id uuid not null
    references public.diagnostic_completions(diagnostic_session_id) on delete cascade,
  -- The diagnostic target sequence is learner-facing state. It must not be
  -- inferred from timestamps because plans created in one RPC transaction can
  -- share the same timestamp resolution.
  position integer not null,
  target_subskill_id text not null references public.subskills(id),
  misconception_tag text not null,
  title text not null check (length(trim(title)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  generation_source text not null
    check (generation_source in ('ai', 'cache', 'fallback')),
  generation_prompt_version text not null
    check (length(trim(generation_prompt_version)) > 0),
  generation_ai_run_ref text,
  validator_version text not null check (length(trim(validator_version)) > 0),
  created_at timestamptz not null default now(),
  constraint practice_plans_position_positive_check check (position > 0),
  -- This is the idempotency key for a diagnostic retry: one plan per selected
  -- sub-skill, even if two requests race to finish the same diagnostic.
  unique (diagnostic_session_id, target_subskill_id),
  -- Keep the prescribed prerequisite-first order durable and unambiguous.
  constraint practice_plans_diagnostic_session_position_key
    unique (diagnostic_session_id, position)
);

-- `practice_plans` can already exist when this migration is applied to a
-- preview database created from an earlier branch. Add and deterministically
-- backfill the ordering column before enforcing its invariant there too.
alter table public.practice_plans
  add column if not exists position integer;

with ranked_plans as (
  select
    id,
    row_number() over (
      partition by diagnostic_session_id
      order by created_at asc, id asc
    )::integer as durable_position
  from public.practice_plans
  where position is null
)
update public.practice_plans plan
  set position = ranked_plans.durable_position
  from ranked_plans
  where plan.id = ranked_plans.id;

alter table public.practice_plans
  alter column position set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.practice_plans'::regclass
      and conname = 'practice_plans_position_positive_check'
  ) then
    alter table public.practice_plans
      add constraint practice_plans_position_positive_check check (position > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.practice_plans'::regclass
      and conname = 'practice_plans_diagnostic_session_position_key'
  ) then
    alter table public.practice_plans
      add constraint practice_plans_diagnostic_session_position_key
      unique (diagnostic_session_id, position);
  end if;
end;
$$;

-- `items` remains the executable, answer-bearing item store used by the
-- existing practice, scoring, hint, and response services. This table records
-- the safe parametric source and validation provenance for each derived item.
create table if not exists public.generated_practice_items (
  item_id text primary key references public.items(id) on delete cascade,
  practice_plan_id text not null references public.practice_plans(id) on delete cascade,
  position integer not null check (position between 1 and 4),
  parametric_spec jsonb not null check (jsonb_typeof(parametric_spec) = 'object'),
  validator_version text not null check (length(trim(validator_version)) > 0),
  created_at timestamptz not null default now(),
  unique (practice_plan_id, position)
);

create index if not exists practice_sessions_diagnostic_session_idx
  on public.practice_sessions (diagnostic_session_id);

create index if not exists practice_plans_diagnostic_session_position_idx
  on public.practice_plans (diagnostic_session_id, position);

create index if not exists practice_plans_target_subskill_idx
  on public.practice_plans (target_subskill_id);

create index if not exists generated_practice_items_plan_position_idx
  on public.generated_practice_items (practice_plan_id, position);

alter table public.diagnostic_completions enable row level security;
alter table public.practice_plans enable row level security;
alter table public.generated_practice_items enable row level security;

-- Read-only browser policies. All creation and mutation remains trusted
-- server/service-role work, just like ai_runs and derived mastery records.
drop policy if exists diagnostic_completions_select_self_or_owned_class
  on public.diagnostic_completions;
create policy diagnostic_completions_select_self_or_owned_class
  on public.diagnostic_completions
  for select to authenticated
  using (
    exists (
      select 1
      from public.diagnostic_sessions session
      where session.id = diagnostic_completions.diagnostic_session_id
        and (
          public.student_owns(session.student_id)
          or public.teacher_can_access_student(session.student_id)
        )
    )
  );

drop policy if exists practice_plans_select_visible_session
  on public.practice_plans;
create policy practice_plans_select_visible_session
  on public.practice_plans
  for select to authenticated
  using (public.can_access_practice_session(id));

-- Parametric specs can reveal an answer through deterministic derivation, so
-- they follow the existing answer-bearing `items` policy: a learner never
-- reads them directly. Trusted server routes use the service role instead.
drop policy if exists generated_practice_items_select_visible_session
  on public.generated_practice_items;
drop policy if exists generated_practice_items_select_teachers_only
  on public.generated_practice_items;
create policy generated_practice_items_select_teachers_only
  on public.generated_practice_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.practice_plans plan
      join public.practice_sessions session on session.id = plan.id
      where plan.id = generated_practice_items.practice_plan_id
        and public.teacher_can_access_student(session.student_id)
    )
  );

-- Atomically materializes an already validated completion. The caller passes
-- only deterministic, server-built records; GPT never runs in SQL. If a
-- completion already exists, the function returns its stable plan IDs and
-- makes no writes. This makes POST retries and concurrent completion requests
-- idempotent without leaking a browser mutation path.
--
-- p_completion shape:
-- { selectedSubskillId, misconceptionTag, evidence, observation, explanation,
--   nextStep, explanationSource, explanationAiRunRef?, completionVersion }
--
-- p_plans shape:
-- [{ id, targetSubskillId, misconceptionTag, title, reason, generationSource,
--    generationPromptVersion, generationAiRunRef?, validatorVersion,
--    items: [{ id, itemType, prompt, answerSpec, solutionSteps, difficulty,
--              distractorMap, parametricSpec }] }]
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
  v_topic_id text;
  v_plan jsonb;
  v_item jsonb;
  v_plan_id text;
  v_plan_position integer;
  v_item_position integer;
  v_existing_plan_ids jsonb;
begin
  if coalesce(jsonb_typeof(p_completion), '') <> 'object' then
    raise exception 'Completion must be a JSON object';
  end if;

  if coalesce(jsonb_typeof(p_plans), '') <> 'array' then
    raise exception 'Generated practice plans must be a JSON array';
  end if;

  if jsonb_array_length(p_plans) = 0 then
    raise exception 'At least one generated practice plan is required';
  end if;

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

  select coalesce(jsonb_agg(plan.id order by plan.position), '[]'::jsonb)
    into v_existing_plan_ids
    from public.practice_plans plan
    where plan.diagnostic_session_id = p_diagnostic_session_id;

  if exists (
    select 1
    from public.diagnostic_completions completion
    where completion.diagnostic_session_id = p_diagnostic_session_id
  ) then
    return jsonb_build_object(
      'created', false,
      'diagnosticSessionId', p_diagnostic_session_id,
      'practicePlanIds', v_existing_plan_ids
    );
  end if;

  if v_session.status <> 'active' then
    raise exception 'Diagnostic session is already complete without a durable completion record';
  end if;

  select assignment.topic_id
    into v_topic_id
    from public.assignments assignment
    where assignment.id = v_session.assignment_id;

  if v_topic_id is null then
    raise exception 'Diagnostic assignment has no topic';
  end if;

  if coalesce(p_completion ->> 'selectedSubskillId', '') = ''
    or coalesce(p_completion ->> 'misconceptionTag', '') = ''
    or coalesce(p_completion ->> 'observation', '') = ''
    or coalesce(p_completion ->> 'explanation', '') = ''
    or coalesce(p_completion ->> 'nextStep', '') = ''
    or coalesce(p_completion ->> 'explanationSource', '') = ''
    or coalesce(p_completion ->> 'completionVersion', '') = '' then
    raise exception 'Completion is missing required fields';
  end if;

  insert into public.diagnostic_completions (
    diagnostic_session_id,
    selected_subskill_id,
    misconception_tag,
    evidence,
    observation,
    explanation,
    next_step,
    explanation_source,
    explanation_ai_run_ref,
    completion_version
  ) values (
    p_diagnostic_session_id,
    p_completion ->> 'selectedSubskillId',
    p_completion ->> 'misconceptionTag',
    coalesce(p_completion -> 'evidence', '[]'::jsonb),
    p_completion ->> 'observation',
    p_completion ->> 'explanation',
    p_completion ->> 'nextStep',
    p_completion ->> 'explanationSource',
    nullif(p_completion ->> 'explanationAiRunRef', ''),
    p_completion ->> 'completionVersion'
  );

  for v_plan, v_plan_position in
    select value, ordinality::integer
    from jsonb_array_elements(p_plans) with ordinality as plans(value, ordinality)
  loop
    if jsonb_typeof(v_plan) <> 'object' then
      raise exception 'Practice plan % must be a JSON object', v_plan_position;
    end if;

    v_plan_id := v_plan ->> 'id';

    if coalesce(v_plan_id, '') = ''
      or coalesce(v_plan ->> 'targetSubskillId', '') = ''
      or coalesce(v_plan ->> 'misconceptionTag', '') = ''
      or coalesce(v_plan ->> 'title', '') = ''
      or coalesce(v_plan ->> 'reason', '') = ''
      or coalesce(v_plan ->> 'generationSource', '') = ''
      or coalesce(v_plan ->> 'generationPromptVersion', '') = ''
      or coalesce(v_plan ->> 'validatorVersion', '') = '' then
      raise exception 'Practice plan % is missing required fields', v_plan_position;
    end if;

    if coalesce(jsonb_typeof(v_plan -> 'items'), '') <> 'array' then
      raise exception 'Practice plan % must contain an items array', v_plan_id;
    end if;

    if jsonb_array_length(v_plan -> 'items') not between 3 and 4 then
      raise exception 'Practice plan % must contain three or four items', v_plan_id;
    end if;

    insert into public.practice_sessions (
      id,
      student_id,
      topic_id,
      status,
      diagnosis_snapshot,
      diagnostic_session_id
    ) values (
      v_plan_id,
      p_student_id,
      v_topic_id,
      'active',
      jsonb_build_object(
        'diagnosticSessionId', p_diagnostic_session_id,
        'selectedSubskillId', p_completion ->> 'selectedSubskillId',
        'misconceptionTag', p_completion ->> 'misconceptionTag',
        'targetSubskillId', v_plan ->> 'targetSubskillId'
      ),
      p_diagnostic_session_id
    );

    insert into public.practice_plans (
      id,
      diagnostic_session_id,
      position,
      target_subskill_id,
      misconception_tag,
      title,
      reason,
      generation_source,
      generation_prompt_version,
      generation_ai_run_ref,
      validator_version
    ) values (
      v_plan_id,
      p_diagnostic_session_id,
      v_plan_position,
      v_plan ->> 'targetSubskillId',
      v_plan ->> 'misconceptionTag',
      v_plan ->> 'title',
      v_plan ->> 'reason',
      v_plan ->> 'generationSource',
      v_plan ->> 'generationPromptVersion',
      nullif(v_plan ->> 'generationAiRunRef', ''),
      v_plan ->> 'validatorVersion'
    );

    v_item_position := 0;
    for v_item in select value from jsonb_array_elements(v_plan -> 'items')
    loop
      v_item_position := v_item_position + 1;

      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Generated item % in plan % must be a JSON object', v_item_position, v_plan_id;
      end if;

      if coalesce(v_item ->> 'id', '') = ''
        or coalesce(v_item ->> 'prompt', '') = ''
        or coalesce(v_item ->> 'difficulty', '') = ''
        or coalesce(jsonb_typeof(v_item -> 'answerSpec'), '') <> 'object'
        or coalesce(jsonb_typeof(v_item -> 'parametricSpec'), '') <> 'object'
        or (v_item ->> 'difficulty') !~ '^[1-9][0-9]*$' then
        raise exception 'Generated item % in plan % is missing required fields', v_item_position, v_plan_id;
      end if;

      insert into public.items (
        id,
        subskill_id,
        item_type,
        prompt,
        answer_spec,
        solution_steps,
        difficulty,
        -- Generated items are active only inside their linked practice
        -- session. Keeping them out of the global active bank prevents a
        -- legacy static-selection query from reusing another learner's item.
        is_active,
        distractor_map
      ) values (
        v_item ->> 'id',
        v_plan ->> 'targetSubskillId',
        coalesce(nullif(v_item ->> 'itemType', ''), 'generated_practice'),
        v_item ->> 'prompt',
        v_item -> 'answerSpec',
        coalesce(v_item -> 'solutionSteps', '[]'::jsonb),
        (v_item ->> 'difficulty')::integer,
        false,
        coalesce(v_item -> 'distractorMap', '{}'::jsonb)
      );

      insert into public.generated_practice_items (
        item_id,
        practice_plan_id,
        position,
        parametric_spec,
        validator_version
      ) values (
        v_item ->> 'id',
        v_plan_id,
        v_item_position,
        v_item -> 'parametricSpec',
        v_plan ->> 'validatorVersion'
      );

      insert into public.practice_session_items (
        practice_session_id,
        item_id,
        position,
        status
      ) values (
        v_plan_id,
        v_item ->> 'id',
        v_item_position,
        'pending'
      );
    end loop;
  end loop;

  update public.diagnostic_sessions
    set status = 'complete', completed_at = now()
    where id = p_diagnostic_session_id;

  return jsonb_build_object(
    'created', true,
    'diagnosticSessionId', p_diagnostic_session_id,
    'practicePlanIds', (
      select coalesce(jsonb_agg(value ->> 'id' order by ordinality), '[]'::jsonb)
      from jsonb_array_elements(p_plans) with ordinality as plans(value, ordinality)
    )
  );
end;
$$;

-- The RPC accepts only trusted, already validated server data. It is not a
-- browser mutation surface; the service-role path is the sole caller.
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
