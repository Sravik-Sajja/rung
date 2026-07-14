-- Creates Rung's initial canonical data model for curriculum, progress, peer gating, and AI audit records.
-- Expand columns and constraints feature-by-feature as each workflow becomes functional.
create table students (id text primary key, display_name text not null, grade_band text not null, is_demo_default boolean default false);
create table classes (id text primary key, name text not null, teacher_display_name text not null);
create table class_enrollments (class_id text references classes(id), student_id text references students(id), primary key (class_id, student_id));
create table topics (id text primary key, slug text unique not null, name text not null);
create table subskills (id text primary key, topic_id text references topics(id), slug text unique not null, name text not null, prerequisite_subskill_id text);
create table items (id text primary key, subskill_id text references subskills(id), item_type text not null, prompt text not null, answer_spec jsonb not null, solution_steps jsonb, difficulty int, is_active boolean default true, distractor_map jsonb default '{}'::jsonb);
create table assignments (id text primary key, class_id text references classes(id), topic_id text references topics(id), title text not null, mode text not null);
create table assignment_items (assignment_id text references assignments(id), item_id text references items(id), position int not null, primary key (assignment_id, item_id));
create table student_responses (id uuid primary key default gen_random_uuid(), student_id text references students(id), item_id text references items(id), answer_raw text not null, is_correct boolean not null, context text not null, submitted_at timestamptz default now());
create table mastery (student_id text references students(id), subskill_id text references subskills(id), level text not null, evidence_count int default 0, last_evaluated_at timestamptz, primary key (student_id, subskill_id));
create table practice_sessions (id text primary key, student_id text references students(id), topic_id text references topics(id), status text not null, diagnosis_snapshot jsonb);
create table practice_session_items (practice_session_id text references practice_sessions(id), item_id text references items(id), position int not null, status text not null, primary key (practice_session_id, item_id));
create table attempt_submissions (id uuid primary key default gen_random_uuid(), student_id text references students(id), item_id text references items(id), attempt_text text not null, verification_status text not null, verification_reason text);
create table peer_solutions (id text primary key, item_id text references items(id), author_alias text not null, approach_text text not null, full_solution text not null, is_vetted boolean default false);
create table peer_unlocks (student_id text references students(id), item_id text references items(id), approach_unlocked_at timestamptz, full_solution_unlocked_at timestamptz, primary key (student_id, item_id));
create table video_recommendations (id text primary key, subskill_id text references subskills(id), title text not null, provider text not null, url text not null, verification_note text, is_active boolean default true);
create table ai_runs (id uuid primary key default gen_random_uuid(), feature text not null, input_hash text not null, prompt_version text not null, model text, status text not null, latency_ms int, output_json jsonb, created_at timestamptz default now());
