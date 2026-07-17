import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/018_per_session_diagnostic_items.sql"),
  "utf8",
);

describe("per-session diagnostic items migration", () => {
  it("materializes a session's items once, under the session lock", () => {
    expect(migration).toContain("create table if not exists public.diagnostic_session_items");
    expect(migration).toContain("for update");
    expect(migration).toContain("from public.diagnostic_session_items existing");
    // The early return is what makes a retried start idempotent rather than
    // minting a second set of items mid-check-in.
    expect(migration).toMatch(/where existing\.diagnostic_session_id = p_diagnostic_session_id\s*\)\s*then\s*return;/);
  });

  it("keeps generated items out of the globally active bank", () => {
    // Same reason 006 does it: no static selection query may hand one learner
    // another learner's numbers.
    expect(migration).toContain("is_active");
    expect(migration).toContain("'generated_diagnostic'");
    expect(migration).toContain("enable row level security");
  });

  it("refuses an item missing the fields scoring and diagnosis depend on", () => {
    expect(migration).toContain("Diagnostic item % is missing required fields");
    expect(migration).toContain("jsonb_typeof(v_item -> 'answerSpec'), '') <> 'object'");
  });

  it("derives finalizer evidence from the session's own items, not the assignment's", () => {
    // The silent one: per-session ids are absent from `assignment_items`, so the
    // old join dropped every response and wrote zero mastery — blank heatmap, no error.
    expect(migration).toContain("from public.diagnostic_session_items session_item");
    expect(migration).toContain("join administered on administered.item_id = response.item_id");
    expect(migration).not.toContain("join public.assignment_items assignment_item\n      on assignment_item.assignment_id = v_session.assignment_id");
  });

  it("still reads pre-migration sessions through the assignment's seeded five", () => {
    expect(migration).toContain("from public.assignment_items assignment_item");
    expect(migration).toMatch(/and not exists \(\s*select 1\s*from public\.diagnostic_session_items session_item/);
  });

  it("carries forward the class scoping the finalizer already had", () => {
    // A `create or replace` that dropped these would silently revert 014.
    expect(migration).toContain("select assignment.class_id");
    expect(migration).toContain("Student % is not enrolled in the class that owns this diagnostic");
    expect(migration).toContain("on conflict (student_id, class_id, subskill_id) do update");
    expect(migration).toContain("when public.mastery.level = 'mastered' then 'mastered'");
  });

  it("leaves the finalizer callable only by the trusted service role", () => {
    expect(migration).toContain("revoke all on function public.materialize_diagnostic_session_items(uuid, text, jsonb) from public");
    expect(migration).toContain("revoke all on function public.finalize_generated_diagnostic_completion(uuid, text, jsonb, jsonb) from public");
    expect(migration).toContain("grant execute on function public.materialize_diagnostic_session_items(uuid, text, jsonb) to service_role");
  });
});
