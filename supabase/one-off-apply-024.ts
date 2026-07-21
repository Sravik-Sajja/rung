// One-off: apply migration 024 (teacher-assigned practice plans) directly
// against SUPABASE_DB_URL, idempotently. Mirrors one-off-apply-023.ts. Not run
// by this task — the user runs it after review. Deleted after use.
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd());

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("SUPABASE_DB_URL is not set");

async function run() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("alter table public.practice_plans alter column diagnostic_session_id drop not null");
    await client.query(`
      alter table public.practice_plans
        add column if not exists origin text not null default 'diagnostic'
          check (origin in ('diagnostic', 'teacher'))
    `);
    await client.query(`
      comment on column public.practice_plans.origin is
        'Who chose this plan''s target skill: the diagnostic pipeline, or a teacher assigning a follow-up directly.'
    `);
    await client.query("alter table public.practice_plans drop constraint if exists practice_plans_generation_source_check");
    await client.query(`
      alter table public.practice_plans
        add constraint practice_plans_generation_source_check
        check (generation_source in ('ai', 'cache', 'fallback', 'teacher'))
    `);

    const { rows } = await client.query(`
      select column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'practice_plans' and column_name in ('diagnostic_session_id', 'origin')
      order by column_name
    `);
    console.table(rows);
  } finally {
    await client.end();
  }
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
