-- Keep anonymous public walkthrough work out of the teacher demo roster.
--
-- `fractions-diagnostic-v1` and its assignment items retain their stable
-- identifiers so the existing student route works unchanged. Only the owning
-- class moves to a dedicated non-teacher walkthrough class.

insert into public.classes (id, name, teacher_display_name)
values (
  'fractions-walkthrough-class',
  'Public fractions walkthrough',
  'Rung walkthrough'
)
on conflict (id) do update
  set name = excluded.name,
      teacher_display_name = excluded.teacher_display_name;

update public.assignments
  set class_id = 'fractions-walkthrough-class'
  where id = 'fractions-diagnostic-v1';

-- Move any still-valid durable participants out of the teacher roster as the
-- migration is applied. Their learner records, diagnostic sessions, and
-- assignment items remain untouched, so an existing cookie can continue the
-- walkthrough without contributing rows to fractions-demo-class.
delete from public.class_enrollments enrollment
using public.demo_participant_sessions session
where enrollment.student_id = session.student_id
  and enrollment.class_id = 'fractions-demo-class';

insert into public.class_enrollments (class_id, student_id)
select 'fractions-walkthrough-class', session.student_id
from public.demo_participant_sessions session
on conflict (class_id, student_id) do nothing;

update public.demo_participant_sessions
  set class_id = 'fractions-walkthrough-class'
  where class_id = 'fractions-demo-class';

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

  -- The app requests an eight-hour session. This upper bound keeps a future
  -- malformed server caller from creating a quasi-permanent anonymous login.
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

  -- The isolated walkthrough class still receives the standard fractions
  -- matrix required by the diagnostic and practice flow.
  insert into public.mastery (
    student_id,
    subskill_id,
    level,
    evidence_count,
    evidence_summary,
    last_evaluated_at
  )
  select
    v_student_id,
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

revoke all on function public.create_demo_participant(text, text, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_demo_participant(text, text, timestamptz) to service_role;
  end if;
end;
$$;
