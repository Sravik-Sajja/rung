-- ai_runs is both the audit log (§6) and the AI response cache: a row with
-- status = 'valid' IS the cache entry, and the adapter's only read is a lookup
-- on (feature, input_hash, prompt_version) filtered to that status.
--
-- The table was created with nothing but its primary key, which was survivable
-- while runs lived in a process-local array. It is not survivable against
-- Postgres: the table gains a row on every adapter call — valid, live_failed,
-- cache_hit, and fallback alike — so an unindexed lookup is a sequential scan
-- over a log that only ever grows, and it degrades exactly as the demo is used.
--
-- The index is partial on status = 'valid' because that is the only status the
-- cache reads. That keeps it small: the failure and cache_hit rows that make up
-- most of the table's volume never enter it.
create index if not exists ai_runs_cache_lookup_idx
  on public.ai_runs (feature, input_hash, prompt_version, created_at desc)
  where status = 'valid';

-- Supports audit reads over the log ("what happened, most recent first") without
-- forcing them through the cache index's leading columns.
create index if not exists ai_runs_feature_created_at_idx
  on public.ai_runs (feature, created_at desc);
