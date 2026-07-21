-- Lets a teacher's "assign a follow-up" action create a real, student-owned
-- practice plan instead of only flipping a client-side notice (the bug this
-- migration exists to fix — see dashboard-view.tsx's `assignFollowUp`). A
-- teacher picks the target skill directly, so the plan it creates has no
-- diagnostic session behind it; every reader that used to assume one now
-- needs a durable way to tell a teacher-assigned plan apart from a
-- diagnostic-generated one.

-- A teacher-assigned plan is not produced by completing a diagnostic, so the
-- FK that required one can no longer be mandatory. NULL is safe here: the
-- unique indexes below key off (diagnostic_session_id, ...), and Postgres
-- treats NULL as distinct from every other NULL, so they simply never fire
-- for a teacher plan. Idempotency for that path is therefore handled by the
-- application (see `assignTeacherPractice` / `assignDemoTeacherPractice`),
-- not the database.
alter table public.practice_plans
  alter column diagnostic_session_id drop not null;

alter table public.practice_plans
  add column if not exists origin text not null default 'diagnostic'
    check (origin in ('diagnostic', 'teacher'));

comment on column public.practice_plans.origin is
  'Who chose this plan''s target skill: the diagnostic pipeline, or a teacher assigning a follow-up directly.';

-- `generation_source` previously described only how the AI pipeline produced a
-- plan (ai/cache/fallback). A teacher-assigned plan is none of those — a
-- human picked the skill — so the same column now also records that case
-- rather than adding a second, overlapping column.
alter table public.practice_plans
  drop constraint if exists practice_plans_generation_source_check;

alter table public.practice_plans
  add constraint practice_plans_generation_source_check
  check (generation_source in ('ai', 'cache', 'fallback', 'teacher'));
