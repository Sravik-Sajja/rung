-- Adds persisted teacher grouping and cached lesson-plan tables for the teacher workflow.
create table teacher_groups (id text primary key, class_id text references classes(id), subskill_id text references subskills(id), label text not null, generated_at timestamptz default now());
create table teacher_group_members (teacher_group_id text references teacher_groups(id), student_id text references students(id), primary key (teacher_group_id, student_id));
create table lesson_plans (id text primary key, teacher_group_id text references teacher_groups(id), content jsonb not null, prompt_version text not null, status text not null, generated_at timestamptz default now());
