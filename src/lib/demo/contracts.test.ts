import { describe, expect, it } from "vitest";
import { canonicalDemoIds, isMasteryLevel, masteryLevels } from "@/lib/demo/contracts";

describe("partner demo contracts", () => {
  it("publishes stable IDs for the seed and teacher dashboard", () => {
    expect(canonicalDemoIds.classId).toBe("fractions-demo-class");
    expect(canonicalDemoIds.mayaStudentId).toBe("maya-chen");
    expect(canonicalDemoIds.commonDenominatorSubskillId).toBe("find-common-denominator");
  });

  it("publishes the complete heatmap mastery enum", () => {
    expect(masteryLevels).toEqual(["not_started", "needs_support", "developing", "mastered"]);
    expect(isMasteryLevel("needs_support")).toBe(true);
    expect(isMasteryLevel("unknown")).toBe(false);
  });
});
