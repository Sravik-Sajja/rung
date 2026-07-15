import { describe, expect, it } from "vitest";
import { tutorLeakageEvalFixtures } from "@/lib/ai/fixtures";
import { containsAnswerLeak, containsGenericTutorLeak } from "@/lib/ai/leakage";

describe("tutor leakage guard", () => {
  it("allows the seeded safe hint ladder", () => {
    for (const fixture of tutorLeakageEvalFixtures) {
      expect(containsAnswerLeak(fixture.hint, fixture.answers, fixture.solutionSteps)).toBe(false);
    }
  });

  it("keeps a guided step short of the completed calculation", () => {
    const guidedStep = tutorLeakageEvalFixtures.find((fixture) => fixture.level === "guided_step")!;
    expect(guidedStep.hint).not.toContain("7/12");
    expect(guidedStep.hint).not.toContain("4/12");
    expect(guidedStep.hint).not.toContain("3/12");
  });

  it("blocks direct answer and full-step leakage", () => {
    expect(containsAnswerLeak("The answer is 7/12.", ["7/12"])).toBe(true);
    expect(containsAnswerLeak("Rewrite both fractions with denominator 12.", ["7/12"], ["Rewrite both fractions with denominator 12."])).toBe(true);
  });

  it("blocks generic final-answer phrasing before an answer key is available", () => {
    expect(containsGenericTutorLeak("The final answer is 7/12.")).toBe(true);
    expect(containsGenericTutorLeak("Try comparing the denominators first.")).toBe(false);
  });
});
