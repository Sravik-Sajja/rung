-- Scope mastery to a class, not just a student.
--
-- `mastery` was keyed (student_id, subskill_id), and `class_mastery_heatmap`
-- joined enrollments to mastery on student_id alone. Any learner enrolled in
-- two classes therefore had one matrix that surfaced in both rosters. That was
-- invisible while every learner belonged to exactly one class, but the public
-- walkthrough and every teacher workspace both teach
-- `fractions-rational-operations`, so a walkthrough learner joining a class
-- would have leaked prior work into that teacher's heatmap.
--
-- Subskills are topic-scoped, so distinct subjects never collided. This
-- migration fixes the same-topic-in-two-classes case by making the class part
-- of the mastery identity.

alter table public.mastery
  add column if not exists class_id text references public.classes(id) on delete cascade;

-- Backfill preferentially by topic: a row belongs to the enrolled class whose
-- assignment teaches the subskill's topic. row_number keeps this deterministic
-- if a learner somehow already has two same-topic classes.
update public.mastery m
set class_id = pick.class_id
from (
  select
    existing.student_id,
    existing.subskill_id,
    enrollment.class_id,
    row_number() over (
      partition by existing.student_id, existing.subskill_id
      order by enrollment.class_id
    ) as rank
  from public.mastery existing
  join public.class_enrollments enrollment on enrollment.student_id = existing.student_id
  join public.subskills skill on skill.id = existing.subskill_id
  join public.assignments assignment
    on assignment.class_id = enrollment.class_id
    and assignment.topic_id = skill.topic_id
) pick
where pick.student_id = m.student_id
  and pick.subskill_id = m.subskill_id
  and pick.rank = 1
  and m.class_id is null;

-- Fall back to a sole enrollment for rows whose class has no assignment on that
-- topic yet (seeded mastery can precede the assignment row).
update public.mastery m
set class_id = enrollment.class_id
from public.class_enrollments enrollment
where m.class_id is null
  and enrollment.student_id = m.student_id
  and (select count(*) from public.class_enrollments other where other.student_id = m.student_id) = 1;

-- Anything still unassigned belongs to a student enrolled nowhere, so no
-- roster, heatmap, or student view could ever read it.
delete from public.mastery where class_id is null;

alter table public.mastery alter column class_id set not null;

alter table public.mastery drop constraint if exists mastery_pkey;
alter table public.mastery add constraint mastery_pkey primary key (student_id, class_id, subskill_id);

drop index if exists mastery_student_subskill_idx;
create index if not exists mastery_student_class_subskill_idx
  on public.mastery (student_id, class_id, subskill_id);
create index if not exists mastery_class_level_idx
  on public.mastery (class_id, subskill_id, level);

-- The heatmap now reads the class recorded on the row itself. The enrollment
-- join stays so an unenrolled learner's rows cannot appear on a roster.
create or replace view public.class_mastery_heatmap as
select
  m.class_id,
  m.student_id,
  m.subskill_id,
  m.level,
  m.evidence_summary
from public.mastery m
join public.class_enrollments ce
  on ce.student_id = m.student_id
  and ce.class_id = m.class_id;

-- 013 intended to replace this but added a fourth-argument overload instead of
-- replacing the five-argument one. The stale version creates a workspace with
-- no assignment and no join code, and writes mastery without a class.
drop function if exists public.create_teacher_demo_workspace(text, text, text, timestamptz);

create or replace function public.create_demo_participant(
  p_display_name text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (
  student_id text,
  display_name text,
  grade_band text,
  class_id text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id text;
  v_display_name text;
  v_class_id constant text := 'fractions-walkthrough-class';
  v_topic_id constant text := 'fractions-rational-operations';
begin
  v_display_name := btrim(coalesce(p_display_name, ''));
  if length(v_display_name) < 1 or length(v_display_name) > 32 then
    raise exception 'A temporary learner needs a first name or nickname of 1 to 32 characters.';
  end if;

  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'The temporary session token is invalid.';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'The temporary session expiry must be within the next 24 hours.';
  end if;

  if not exists (select 1 from public.classes where id = v_class_id) then
    raise exception 'The configured walkthrough class does not exist. Run the demo seed first.';
  end if;

  if not exists (select 1 from public.subskills where topic_id = v_topic_id) then
    raise exception 'The configured demo curriculum does not exist. Run the demo seed first.';
  end if;

  v_student_id := 'demo-learner-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.students (id, display_name, grade_band, is_demo_default)
  values (v_student_id, v_display_name, '6-8', false);

  insert into public.class_enrollments (class_id, student_id)
  values (v_class_id, v_student_id);

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
    v_student_id,
    v_class_id,
    skill.id,
    'not_started',
    0,
    'Temporary walkthrough learner has not submitted work yet.',
    now()
  from public.subskills skill
  where skill.topic_id = v_topic_id;

  insert into public.demo_participant_sessions (student_id, class_id, token_hash, expires_at)
  values (v_student_id, v_class_id, p_token_hash, p_expires_at);

  return query
  select v_student_id, v_display_name, '6-8'::text, v_class_id, p_expires_at;
end;
$$;

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
  v_student_id text;
  v_roster text[] := array['Avery Chen', 'Diego Morales', 'Imani Brooks', 'Noah Patel', 'Sofia Williams', 'Theo Nguyen'];
  v_student_name text;
  v_index int := 0;
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

  foreach v_student_name in array v_roster loop
    v_index := v_index + 1;
    v_student_id := 'teacher-demo-student-' || replace(gen_random_uuid()::text, '-', '');
    insert into public.students (id, display_name, grade_band, is_demo_default) values (v_student_id, v_student_name, case when v_index <= 3 then '6' else '7' end, false);
    insert into public.class_enrollments (class_id, student_id) values (v_class_id, v_student_id);
    insert into public.mastery (student_id, class_id, subskill_id, level, evidence_count, evidence_summary, last_evaluated_at)
      select v_student_id, v_class_id, skill.id,
        (array['developing', 'needs_support', 'mastered', 'developing', 'not_started', 'needs_support'])[((v_index + row_number() over (order by skill.id)::int - 2) % 6) + 1],
        1, 'Fictional starter evidence for this temporary workspace.', now()
      from public.subskills skill where skill.topic_id = 'fractions-rational-operations';
  end loop;
  insert into public.teacher_demo_sessions (teacher_id, class_id, assignment_id, token_hash, join_code, expires_at)
  values (v_teacher_id, v_class_id, v_assignment_id, p_token_hash, p_join_code, p_expires_at);
  return query select v_class_id, v_assignment_id, v_class_name, v_teacher_name, p_expires_at;
end;
$$;

create or replace function public.join_teacher_demo_workspace(
  p_join_code text, p_display_name text, p_token_hash text, p_expires_at timestamptz
) returns table (student_id text, display_name text, grade_band text, class_id text, assignment_id text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_session public.teacher_demo_sessions%rowtype;
  v_student_id text := 'teacher-demo-learner-' || replace(gen_random_uuid()::text, '-', '');
  v_expiry timestamptz;
begin
  if length(v_display_name) < 1 or length(v_display_name) > 32 then raise exception 'A joined student needs a first name or nickname of 1 to 32 characters.'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Joined student session token is invalid.'; end if;
  if coalesce(p_join_code, '') !~ '^[A-F0-9]{4}(-[A-F0-9]{4}){2}$' then raise exception 'Join code is invalid.'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then raise exception 'Joined student expiry must be within the next 24 hours.'; end if;
  select session.* into v_session from public.teacher_demo_sessions session
    where session.join_code = p_join_code and session.revoked_at is null and session.expires_at > now() for update;
  if not found then raise exception 'That join code is not active.'; end if;
  if not exists (select 1 from public.assignments assignment where assignment.id = v_session.assignment_id and assignment.class_id = v_session.class_id and assignment.mode = 'diagnostic') then
    raise exception 'The joined assignment does not belong to this class.';
  end if;
  v_expiry := least(p_expires_at, v_session.expires_at);
  insert into public.students (id, display_name, grade_band, is_demo_default) values (v_student_id, v_display_name, '6-8', false);
  insert into public.class_enrollments (class_id, student_id) values (v_session.class_id, v_student_id);
  insert into public.mastery (student_id, class_id, subskill_id, level, evidence_count, evidence_summary, last_evaluated_at)
    select v_student_id, v_session.class_id, skill.id, 'not_started', 0, 'Joined this temporary workspace and has not submitted work yet.', now()
    from public.subskills skill join public.assignments assignment on assignment.topic_id = skill.topic_id
    where assignment.id = v_session.assignment_id and assignment.class_id = v_session.class_id;
  insert into public.teacher_demo_student_sessions (teacher_demo_session_id, student_id, class_id, assignment_id, token_hash, expires_at)
    values (v_session.id, v_student_id, v_session.class_id, v_session.assignment_id, p_token_hash, v_expiry);
  return query select v_student_id, v_display_name, '6-8'::text, v_session.class_id, v_session.assignment_id, v_expiry;
end;
$$;

-- The finalizer derives the class from the session's own assignment rather than
-- taking it from the caller, so a diagnostic can only ever write mastery into
-- the class that assigned it.
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

revoke all on function public.create_demo_participant(text, text, timestamptz) from public;
revoke all on function public.create_teacher_demo_workspace(text, text, text, text, timestamptz) from public;
revoke all on function public.join_teacher_demo_workspace(text, text, text, timestamptz) from public;
revoke all on function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_demo_participant(text, text, timestamptz) to service_role;
    grant execute on function public.create_teacher_demo_workspace(text, text, text, text, timestamptz) to service_role;
    grant execute on function public.join_teacher_demo_workspace(text, text, text, timestamptz) to service_role;
    grant execute on function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb) to service_role;
  end if;
end $$;
