-- Stable data contract for the seeded fractions demo and teacher heatmap.
-- This is intentionally a forward migration: 001_initial_schema.sql remains the base schema.

alter table mastery
  add column if not exists evidence_summary text not null default 'No recorded evidence yet.';

alter table mastery
  drop constraint if exists mastery_level_check;

alter table mastery
  add constraint mastery_level_check
  check (level in ('not_started', 'needs_support', 'developing', 'mastered'));

-- A practice item can appear once at its original position and once as a later requeue.
alter table practice_session_items
  drop constraint if exists practice_session_items_pkey;

alter table practice_session_items
  add column if not exists id uuid default gen_random_uuid();

update practice_session_items
  set id = gen_random_uuid()
  where id is null;

alter table practice_session_items
  alter column id set not null;

alter table practice_session_items
  add constraint practice_session_items_pkey primary key (id);

create index if not exists mastery_student_subskill_idx
  on mastery (student_id, subskill_id);

create index if not exists mastery_subskill_level_idx
  on mastery (subskill_id, level);

create or replace view class_mastery_heatmap as
select
  ce.class_id,
  m.student_id,
  m.subskill_id,
  m.level,
  m.evidence_summary
from class_enrollments ce
join mastery m on m.student_id = ce.student_id;
