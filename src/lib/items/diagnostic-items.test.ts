import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_FORM_COUNT, buildDiagnosticItems } from "@/lib/items/diagnostic-items";
import { canonicalDemoStudents, canonicalDiagnosticItemIds } from "@/lib/demo/contracts";
import { scoreAnswer } from "@/lib/math/scoring";

/** Many ids, so "some student gets form B" is not left to luck in a deterministic generator. */
const MANY_STUDENT_IDS = Array.from({ length: 60 }, (_, index) => `student-${index}`);

/** Sentence shape with the numbers removed, so two forms differ even when values collide. */
const shapeOf = (prompt: string) => prompt.replace(/\d+/g, "#");

describe("per-student diagnostic items", () => {
  it("keeps the locked item ids and their stable order for every student", () => {
    for (const student of canonicalDemoStudents) {
      expect(buildDiagnosticItems(student.id).map((item) => item.id)).toEqual([...canonicalDiagnosticItemIds]);
    }
  });

  it("is deterministic: the same student always gets the same five questions", () => {
    // Answers are keyed by item id mid-session, so an unstable build would score a learner
    // against questions they never saw.
    const first = buildDiagnosticItems("maya-chen");
    const second = buildDiagnosticItems("maya-chen");
    expect(second).toEqual(first);
  });

  it("gives different students different numbers", () => {
    const prompts = canonicalDemoStudents.map((student) =>
      buildDiagnosticItems(student.id).map((item) => item.prompt).join("|"),
    );
    expect(new Set(prompts).size).toBeGreaterThan(1);
  });

  it("accepts its own computed answer and rejects its own distractor for every form", () => {
    for (const studentId of MANY_STUDENT_IDS) {
      for (const item of buildDiagnosticItems(studentId)) {
        expect(scoreAnswer(item, item.answerSpec.accepted[0])).toBe(true);
        for (const distractor of Object.keys(item.distractorMap)) {
          expect(scoreAnswer(item, distractor)).toBe(false);
        }
      }
    }
  });

  it("never asks for a negative difference", () => {
    for (const studentId of MANY_STUDENT_IDS) {
      const subtract = buildDiagnosticItems(studentId).find((item) => item.id === "subtract-unlike-1")!;
      expect(subtract.answerSpec.accepted[0].startsWith("-")).toBe(false);
    }
  });

  it("does not let the equivalent-fraction item be passed by restating the question", () => {
    for (const studentId of MANY_STUDENT_IDS) {
      const equivalent = buildDiagnosticItems(studentId).find((item) => item.id === "equivalent-1")!;
      // The fraction the prompt already shows. Scoring compares by value, so this is equivalent to
      // the correct answer and would score correct without the exact_denominator rule.
      const [, shown] = /(\d+\/\d+)/.exec(equivalent.prompt)!;
      expect(scoreAnswer(equivalent, shown)).toBe(false);
      expect(scoreAnswer(equivalent, equivalent.answerSpec.accepted[0])).toBe(true);
    }
  });

  it("never hands the multiplier to the learner", () => {
    for (const studentId of MANY_STUDENT_IDS) {
      const equivalent = buildDiagnosticItems(studentId).find((item) => item.id === "equivalent-1")!;
      expect(equivalent.prompt).not.toContain("multiplied by");
    }
  });

  it("uses a labelled visual, never the accepted fraction, for number-line questions", () => {
    for (const studentId of MANY_STUDENT_IDS) {
      const item = buildDiagnosticItems(studentId).find((candidate) => candidate.id === "number-line-1")!;
      expect(item.visualSpec).toMatchObject({ kind: "number_line", pointLabel: "C" });
      expect(item.prompt).toMatch(/point C/i);
      expect(item.prompt).not.toContain(item.answerSpec.accepted[0]);
      expect(scoreAnswer(item, item.answerSpec.accepted[0])).toBe(true);
    }
  });

  it("draws the five questions from a bank bigger than five", () => {
    expect(DIAGNOSTIC_FORM_COUNT).toBeGreaterThan(5);
  });

  it("varies the question form across students, not only the numbers", () => {
    for (const slotId of canonicalDiagnosticItemIds) {
      const shapes = new Set(MANY_STUDENT_IDS.map((studentId) =>
        shapeOf(buildDiagnosticItems(studentId).find((item) => item.id === slotId)!.prompt),
      ));
      expect(shapes.size).toBeGreaterThan(1);
    }
  });

  it("always measures all five subskills, so a gap can never go unasked", () => {
    for (const studentId of MANY_STUDENT_IDS) {
      const subskills = buildDiagnosticItems(studentId).map((item) => item.subskillId);
      expect(new Set(subskills).size).toBe(5);
    }
  });
});
