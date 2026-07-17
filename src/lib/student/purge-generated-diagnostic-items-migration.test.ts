import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/019_purge_generated_diagnostic_items.sql"),
  "utf8",
);

describe("generated diagnostic item purge migration", () => {
  it("collects the item ids before the cascade that strands them", () => {
    // The session delete removes the link rows naming these items, so reading
    // them afterwards finds nothing and the items leak.
    const collect = migration.indexOf("into v_generated_item_ids");
    const deleteSessions = migration.indexOf("delete from public.diagnostic_sessions");
    expect(collect).toBeGreaterThan(-1);
    expect(deleteSessions).toBeGreaterThan(-1);
    expect(collect).toBeLessThan(deleteSessions);
  });

  it("can never delete a seeded canonical item", () => {
    expect(migration).toContain("and item_type = 'generated_diagnostic'");
    expect(migration).toMatch(/delete from public\.items\s*\n\s*where id = any \(v_generated_item_ids\)/);
  });

  it("sweeps only items whose session is gone and whose evidence is gone", () => {
    expect(migration).toMatch(/not exists \(\s*select 1 from public\.diagnostic_session_items link where link\.item_id = item\.id\s*\)/);
    expect(migration).toMatch(/not exists \(\s*select 1 from public\.student_responses response where response\.item_id = item\.id\s*\)/);
  });

  it("preserves the removal behaviour 017 already had", () => {
    // A create-or-replace that dropped these would silently widen or break removal.
    expect(migration).toContain("That student is not in this class.");
    expect(migration).toContain("delete from public.practice_session_items where practice_session_id = any (v_practice_ids)");
    expect(migration).toContain("delete from public.mastery where student_id = p_student_id and class_id = p_class_id");
    expect(migration).toContain("delete from public.class_enrollments where student_id = p_student_id and class_id = p_class_id");
    expect(migration).toContain("set revoked_at = now()");
    expect(migration).toContain("revoke all on function public.remove_teacher_demo_workspace_student(text, text) from public");
  });
});
