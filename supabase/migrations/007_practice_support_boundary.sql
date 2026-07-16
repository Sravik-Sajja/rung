-- Durable, server-owned state for the bounded "Still stuck? Show your work"
-- escalation. Raw typed work and photos never enter these tables: they remain
-- in request memory only. This migration records only the safe progression
-- events needed to enforce miss -> substantive hint -> later miss -> one claim.

alter table public.student_responses
  add column if not exists practice_session_item_id uuid
    references public.practice_session_items(id) on delete set null;

alter table public.student_responses
  drop constraint if exists student_responses_session_context_check;

-- Keep historical rows valid while requiring every *new* practice response to
-- identify the exact occurrence it answered. The NOT VALID form is a forward
-- migration: PostgreSQL still enforces it for new writes without rejecting
-- legacy rows that predate occurrence IDs.
alter table public.student_responses
  add constraint student_responses_session_context_check
  check (
    (context = 'diagnostic'
      and diagnostic_session_id is not null
      and practice_session_id is null
      and practice_session_item_id is null)
    or
    (context = 'practice'
      and practice_session_id is not null
      and practice_session_item_id is not null
      and diagnostic_session_id is null)
  ) not valid;

create index if not exists student_responses_practice_occurrence_idx
  on public.student_responses (practice_session_item_id, submitted_at);

create table if not exists public.practice_support_events (
  id uuid primary key default gen_random_uuid(),
  practice_session_id text not null
    references public.practice_sessions(id) on delete cascade,
  practice_session_item_id uuid not null
    references public.practice_session_items(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  item_id text not null references public.items(id) on delete cascade,
  event_kind text not null check (event_kind in (
    'miss',
    'correct',
    'nudge',
    'hint',
    'guided_step',
    'work_help_claimed'
  )),
  created_at timestamptz not null default clock_timestamp()
);

-- State is scoped to the logical item, not just an occurrence. A requeue has
-- a fresh occurrence ID but is still the same math problem for this bounded
-- support sequence.
create table if not exists public.practice_support_state (
  practice_session_id text not null
    references public.practice_sessions(id) on delete cascade,
  item_id text not null references public.items(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  last_miss_at timestamptz,
  last_substantive_hint_at timestamptz,
  correct_at timestamptz,
  work_help_claimed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (practice_session_id, item_id)
);

create index if not exists practice_support_events_session_item_idx
  on public.practice_support_events (practice_session_id, item_id, created_at);

create index if not exists practice_support_state_student_idx
  on public.practice_support_state (student_id, practice_session_id);

-- One durable claim is allowed for a logical item in a session. A failed AI
-- request deletes its reservation through release_practice_work_help_claim,
-- so a network/model failure does not consume the learner's one response.
create unique index if not exists practice_support_one_work_help_claim_idx
  on public.practice_support_events (practice_session_id, item_id)
  where event_kind = 'work_help_claimed';

alter table public.practice_support_events enable row level security;
alter table public.practice_support_state enable row level security;

-- There is intentionally no browser policy for these tables. Trusted server
-- procedures and the response trigger create events; browser clients cannot
-- manufacture an eligible work-help state.

create or replace function public.apply_practice_support_event_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence_item_id text;
  occurrence_student_id text;
begin
  select occurrence.item_id, session_row.student_id
    into occurrence_item_id, occurrence_student_id
  from public.practice_session_items occurrence
  join public.practice_sessions session_row
    on session_row.id = occurrence.practice_session_id
  where occurrence.id = new.practice_session_item_id
    and occurrence.practice_session_id = new.practice_session_id;

  if occurrence_item_id is null
    or occurrence_item_id <> new.item_id
    or occurrence_student_id <> new.student_id then
    raise exception 'Practice support event does not match its owned occurrence';
  end if;

  insert into public.practice_support_state (
    practice_session_id,
    item_id,
    student_id
  ) values (
    new.practice_session_id,
    new.item_id,
    new.student_id
  )
  on conflict (practice_session_id, item_id) do nothing;

  -- Serialize all event-derived updates for this logical item. The claim
  -- procedure takes the same lock before deciding whether it may reserve.
  perform 1
  from public.practice_support_state state_row
  where state_row.practice_session_id = new.practice_session_id
    and state_row.item_id = new.item_id
  for update;

  if new.event_kind = 'miss' then
    update public.practice_support_state
      set last_miss_at = new.created_at,
          updated_at = clock_timestamp()
      where practice_session_id = new.practice_session_id
        and item_id = new.item_id;
  elsif new.event_kind in ('hint', 'guided_step') then
    update public.practice_support_state
      set last_substantive_hint_at = new.created_at,
          updated_at = clock_timestamp()
      where practice_session_id = new.practice_session_id
        and item_id = new.item_id
        and last_miss_at is not null
        and (correct_at is null or correct_at < last_miss_at);
  elsif new.event_kind = 'correct' then
    update public.practice_support_state
      set correct_at = new.created_at,
          updated_at = clock_timestamp()
      where practice_session_id = new.practice_session_id
        and item_id = new.item_id;
  elsif new.event_kind = 'work_help_claimed' then
    update public.practice_support_state
      set work_help_claimed_at = new.created_at,
          updated_at = clock_timestamp()
      where practice_session_id = new.practice_session_id
        and item_id = new.item_id;
  end if;

  return new;
end;
$$;

drop trigger if exists practice_support_events_apply_state on public.practice_support_events;
create trigger practice_support_events_apply_state
  before insert on public.practice_support_events
  for each row execute procedure public.apply_practice_support_event_state();

create or replace function public.record_practice_response_support_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence_item_id text;
  occurrence_status text;
  current_occurrence_id uuid;
begin
  if new.context <> 'practice' then
    return new;
  end if;

  if new.practice_session_id is null or new.practice_session_item_id is null then
    raise exception 'Practice responses require a practice-session occurrence';
  end if;

  select occurrence.item_id, occurrence.status
    into occurrence_item_id, occurrence_status
  from public.practice_session_items occurrence
  join public.practice_sessions session_row
    on session_row.id = occurrence.practice_session_id
  where occurrence.id = new.practice_session_item_id
    and occurrence.practice_session_id = new.practice_session_id
    and session_row.student_id = new.student_id;

  if occurrence_item_id is null or occurrence_item_id <> new.item_id or occurrence_status = 'correct' then
    raise exception 'Practice response does not match an active owned occurrence';
  end if;

  select occurrence.id
    into current_occurrence_id
  from public.practice_session_items occurrence
  where occurrence.practice_session_id = new.practice_session_id
    and occurrence.status <> 'correct'
  order by occurrence.position asc
  limit 1;

  if current_occurrence_id is distinct from new.practice_session_item_id then
    raise exception 'Practice response must target the current occurrence';
  end if;

  insert into public.practice_support_events (
    practice_session_id,
    practice_session_item_id,
    student_id,
    item_id,
    event_kind
  ) values (
    new.practice_session_id,
    new.practice_session_item_id,
    new.student_id,
    new.item_id,
    case when new.is_correct then 'correct' else 'miss' end
  );

  return new;
end;
$$;

drop trigger if exists student_responses_record_practice_support_event on public.student_responses;
create trigger student_responses_record_practice_support_event
  before insert on public.student_responses
  for each row execute procedure public.record_practice_response_support_event();

create or replace function public.record_practice_support_hint(
  p_practice_session_id text,
  p_practice_session_item_id uuid,
  p_student_id text,
  p_level text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence_item_id text;
  current_occurrence_id uuid;
begin
  if p_level not in ('nudge', 'hint', 'guided_step') then
    return false;
  end if;

  select occurrence.item_id
    into occurrence_item_id
  from public.practice_session_items occurrence
  join public.practice_sessions session_row
    on session_row.id = occurrence.practice_session_id
  where occurrence.id = p_practice_session_item_id
    and occurrence.practice_session_id = p_practice_session_id
    and occurrence.status <> 'correct'
    and session_row.student_id = p_student_id
  for update of occurrence;

  if occurrence_item_id is null then
    return false;
  end if;

  select occurrence.id
    into current_occurrence_id
  from public.practice_session_items occurrence
  where occurrence.practice_session_id = p_practice_session_id
    and occurrence.status <> 'correct'
  order by occurrence.position asc
  limit 1;

  if current_occurrence_id is distinct from p_practice_session_item_id then
    return false;
  end if;

  insert into public.practice_support_events (
    practice_session_id,
    practice_session_item_id,
    student_id,
    item_id,
    event_kind
  ) values (
    p_practice_session_id,
    p_practice_session_item_id,
    p_student_id,
    occurrence_item_id,
    p_level
  );

  return true;
end;
$$;

create or replace function public.claim_practice_work_help(
  p_practice_session_id text,
  p_practice_session_item_id uuid,
  p_student_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence_item_id text;
  current_occurrence_id uuid;
  claim_id uuid;
  state_row public.practice_support_state%rowtype;
begin
  select occurrence.item_id
    into occurrence_item_id
  from public.practice_session_items occurrence
  join public.practice_sessions session_row
    on session_row.id = occurrence.practice_session_id
  where occurrence.id = p_practice_session_item_id
    and occurrence.practice_session_id = p_practice_session_id
    and occurrence.status = 'missed'
    and session_row.student_id = p_student_id
  for update of occurrence;

  if occurrence_item_id is null then
    return null;
  end if;

  select occurrence.id
    into current_occurrence_id
  from public.practice_session_items occurrence
  where occurrence.practice_session_id = p_practice_session_id
    and occurrence.status <> 'correct'
  order by occurrence.position asc
  limit 1;

  if current_occurrence_id is distinct from p_practice_session_item_id then
    return null;
  end if;

  insert into public.practice_support_state (
    practice_session_id,
    item_id,
    student_id
  ) values (
    p_practice_session_id,
    occurrence_item_id,
    p_student_id
  ) on conflict (practice_session_id, item_id) do nothing;

  select *
    into state_row
  from public.practice_support_state
  where practice_session_id = p_practice_session_id
    and item_id = occurrence_item_id
  for update;

  if state_row.student_id <> p_student_id
    or state_row.last_miss_at is null
    or state_row.last_substantive_hint_at is null
    or state_row.last_miss_at <= state_row.last_substantive_hint_at
    or (state_row.correct_at is not null and state_row.correct_at >= state_row.last_miss_at)
    or state_row.work_help_claimed_at is not null then
    return null;
  end if;

  begin
    insert into public.practice_support_events (
      practice_session_id,
      practice_session_item_id,
      student_id,
      item_id,
      event_kind
    ) values (
      p_practice_session_id,
      p_practice_session_item_id,
      p_student_id,
      occurrence_item_id,
      'work_help_claimed'
    ) returning id into claim_id;
  exception when unique_violation then
    return null;
  end;

  return claim_id;
end;
$$;

create or replace function public.release_practice_work_help_claim(
  p_claim_id uuid,
  p_practice_session_id text,
  p_student_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_item_id text;
begin
  delete from public.practice_support_events
  where id = p_claim_id
    and practice_session_id = p_practice_session_id
    and student_id = p_student_id
    and event_kind = 'work_help_claimed'
  returning item_id into claim_item_id;

  if claim_item_id is null then
    return false;
  end if;

  update public.practice_support_state
    set work_help_claimed_at = null,
        updated_at = clock_timestamp()
    where practice_session_id = p_practice_session_id
      and item_id = claim_item_id;

  return true;
end;
$$;

revoke all on function public.record_practice_support_hint(text, uuid, text, text) from public;
revoke all on function public.claim_practice_work_help(text, uuid, text) from public;
revoke all on function public.release_practice_work_help_claim(uuid, text, text) from public;

grant execute on function public.record_practice_support_hint(text, uuid, text, text) to service_role;
grant execute on function public.claim_practice_work_help(text, uuid, text) to service_role;
grant execute on function public.release_practice_work_help_claim(uuid, text, text) to service_role;
