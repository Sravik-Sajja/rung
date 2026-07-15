import { describe, expect, it } from "vitest";
import {
  canonicalDemoIds,
  canonicalDemoStudents,
  canonicalDemoSubskillIds,
  canonicalTeacherGroupIds,
  canonicalTeacherPracticeItemIds,
  isMasteryLevel,
  masteryLevels,
} from "@/lib/demo/contracts";

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

  it("locks a complete teacher-compatible roster and 5-skill matrix shape", () => {
    expect(canonicalDemoStudents).toHaveLength(8);
    expect(canonicalDemoStudents.map((student) => student.id)).toContain(canonicalDemoIds.mayaStudentId);
    expect(canonicalDemoSubskillIds).toHaveLength(5);
  });

  it("keeps every teacher group practice reference inside the seeded item bank", () => {
    expect(canonicalTeacherGroupIds).toEqual(canonicalDemoSubskillIds);
    expect(canonicalTeacherPracticeItemIds).toEqual([
      "equivalent-1",
      "number-line-1",
      "common-denominator-1",
      "add-unlike-1",
      "subtract-unlike-1",
    ]);
  });
});
