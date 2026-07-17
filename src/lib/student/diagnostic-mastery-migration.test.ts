import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/010_diagnostic_mastery_finalizer.sql"),
  "utf8",
);

describe("diagnostic mastery finalizer migration", () => {
  it("derives idempotent mastery from the server-stored diagnostic responses", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("from public.student_responses response");
    expect(migration).toContain("response.is_correct");
    expect(migration).toContain("response.context = 'diagnostic'");
    expect(migration).toContain("order by response.item_id, response.submitted_at desc, response.id desc");
    expect(migration).toContain("from public.diagnostic_completions completion");
  });

  it("enforces diagnostic mastery transitions without a direct mastered promotion", () => {
    expect(migration).toContain("case when evidence.all_correct then 'developing' else 'needs_support' end");
    expect(migration).toContain("when public.mastery.level = 'mastered' then 'mastered'");
    expect(migration).toContain("when excluded.level = 'needs_support' then 'needs_support'");
    expect(migration.indexOf("when public.mastery.level = 'mastered' then 'mastered'"))
      .toBeLessThan(migration.indexOf("when excluded.level = 'needs_support' then 'needs_support'"));
    expect(migration).not.toContain("then 'mastered' else 'developing'");
  });
});
