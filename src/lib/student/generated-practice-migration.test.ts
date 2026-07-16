import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/006_generated_practice_plans.sql"),
  "utf8",
);

describe("generated-practice persistence migration", () => {
  it("makes diagnostic plan order durable rather than timestamp-derived", () => {
    expect(migration).toContain("add column if not exists position integer");
    expect(migration).toContain("unique (diagnostic_session_id, position)");
    expect(migration).toContain("with ordinality as plans(value, ordinality)");
    expect(migration).toContain("v_plan_position,");
    expect(migration).toContain("jsonb_agg(plan.id order by plan.position)");
  });
});
