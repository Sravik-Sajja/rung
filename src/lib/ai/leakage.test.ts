import { describe, expect, it } from "vitest";
import { tutorLeakageEvalFixtures } from "@/lib/ai/fixtures";
import { containsAnswerLeak } from "@/lib/ai/leakage";

describe("tutor leakage guard", () => {
  it("allows the seeded safe hint ladder", () => {
    for (const fixture of tutorLeakageEvalFixtures) {
      expect(containsAnswerLeak(fixture.hint, fixture.answers, fixture.solutionSteps)).toBe(false);
    }
  });

  it("blocks direct answer and full-step leakage", () => {
    expect(containsAnswerLeak("The answer is 7/12.", ["7/12"])).toBe(true);
    expect(containsAnswerLeak("Rewrite both fractions with denominator 12.", ["7/12"], ["Rewrite both fractions with denominator 12."])).toBe(true);
  });
});
