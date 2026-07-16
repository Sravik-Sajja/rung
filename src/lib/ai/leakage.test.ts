import { describe, expect, it } from "vitest";
import { tutorHintFallbacksByItemAndLevel, tutorLeakageEvalFixtures } from "@/lib/ai/fixtures";
import { containsAnswerLeak, containsGenericTutorLeak } from "@/lib/ai/leakage";
import {
  getMayaDiagnosisContent,
  mayaPeerWorkedExamples,
  mayaPracticeItemContent,
} from "@/lib/content/maya-fractions";

describe("tutor leakage guard", () => {
  it("allows every item-specific Maya hint rung", () => {
    expect(tutorLeakageEvalFixtures).toHaveLength(12);

    for (const fixture of tutorLeakageEvalFixtures) {
      expect(containsAnswerLeak(fixture.hint, fixture.answers, fixture.solutionSteps)).toBe(false);
      expect(containsGenericTutorLeak(fixture.hint)).toBe(false);
      expect(tutorHintFallbacksByItemAndLevel[fixture.itemId]?.[fixture.level].hint).toBe(fixture.hint);
    }
  });

  it("keeps every guided step short of a completed calculation", () => {
    for (const fixture of tutorLeakageEvalFixtures.filter((fixture) => fixture.level === "guided_step")) {
      const protectedContent = mayaPracticeItemContent[fixture.itemId];
      for (const answer of protectedContent.answerValues) {
        expect(fixture.hint).not.toContain(answer);
      }
      for (const solutionStep of protectedContent.solutionSteps) {
        expect(fixture.hint).not.toContain(solutionStep);
      }
    }
  });

  it("keeps the three vetted peer first steps separate from their full solutions", () => {
    expect(mayaPeerWorkedExamples).toHaveLength(3);

    for (const example of mayaPeerWorkedExamples) {
      const protectedContent = mayaPracticeItemContent[example.itemId];
      expect(example.isVetted).toBe(true);
      expect(example.reviewStatus).toBe("reviewed");
      expect(example.fictional).toBe(true);
      expect(containsAnswerLeak(example.approachText, protectedContent.answerValues, protectedContent.solutionSteps)).toBe(false);
      expect(protectedContent.answerValues.some((answer) => example.fullSolution.includes(answer))).toBe(true);
    }
  });

  it("keeps Maya's diagnosis language bounded to deterministic supported tags", () => {
    expect(getMayaDiagnosisContent("adds_denominators")?.explanation).toContain("denominators match");
    expect(getMayaDiagnosisContent("adds_numerators_and_denominators")?.nextStep)
      .toBe("Practice finding a common denominator, then use it to add fractions.");
    expect(getMayaDiagnosisContent("invented_by_model")).toBeNull();
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
