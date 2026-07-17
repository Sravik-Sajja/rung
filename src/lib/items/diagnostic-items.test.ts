import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_FORM_COUNT, buildDiagnosticItems, buildDiagnosticSessionItems } from "@/lib/items/diagnostic-items";
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
      const shapes = new Set(MANY_STUDENT_IDS.map((studentId) => {
        const item = buildDiagnosticItems(studentId).find((candidate) => candidate.id === slotId)!;
        // Number-line questions deliberately have stable visual-first wording;
        // their variation lives in the marked point rather than the sentence.
        return item.visualSpec?.kind === "number_line"
          ? `point:${item.visualSpec.markedNumerator}/${item.visualSpec.denominator}`
          : shapeOf(item.prompt);
      }));
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

describe("per-session diagnostic items", () => {
  const session = { studentId: "maya-chen", assignmentId: "fractions-diagnostic-v1", diagnosticSessionId: "session-a" };

  it("keeps the canonical slot ids while giving each item a session-scoped id", () => {
    // The slot is what the heatmap columns and `selectDiagnosticGap` key off, so it
    // must survive; the item id must not, because these rows go into `items` and a
    // shared id would mean one learner overwriting another's numbers.
    const built = buildDiagnosticSessionItems(session);
    expect(built.map((entry) => entry.slotId)).toEqual([...canonicalDiagnosticItemIds]);
    expect(built.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5]);
    for (const entry of built) {
      expect(entry.item.id).toBe(`${entry.slotId}--session-a`);
    }
  });

  it("mints ids no other session can collide with", () => {
    const first = buildDiagnosticSessionItems(session).map((entry) => entry.item.id);
    const second = buildDiagnosticSessionItems({ ...session, diagnosticSessionId: "session-b" }).map((entry) => entry.item.id);
    expect(new Set([...first, ...second]).size).toBe(10);
  });

  const promptsOf = (input: Parameters<typeof buildDiagnosticSessionItems>[0]) =>
    buildDiagnosticSessionItems(input).map((entry) => entry.item.prompt).join("|");

  it("rerolls on the class alone, holding the session fixed", () => {
    // The bug this path exists to fix: join a second class, get the same five.
    // Varying the session id too would pass this even if the class never reached
    // the seed, so the session is pinned and only the assignment moves.
    const classes = Array.from({ length: 12 }, (_, index) =>
      promptsOf({ ...session, assignmentId: `assignment-${index}` }));
    expect(new Set(classes).size).toBeGreaterThan(1);
  });

  it("rerolls on a new session, holding the class fixed", () => {
    // The other half: a fresh sitting of the same assignment draws again.
    const sittings = Array.from({ length: 12 }, (_, index) =>
      promptsOf({ ...session, diagnosticSessionId: `session-${index}` }));
    expect(new Set(sittings).size).toBeGreaterThan(1);
  });

  it("is deterministic for a given session", () => {
    expect(buildDiagnosticSessionItems(session)).toEqual(buildDiagnosticSessionItems(session));
  });

  it("carries a distractor map on every item so gap diagnosis keeps its misconception tags", () => {
    // An empty map degrades every miss to a null tag and a generic fallback diagnosis.
    for (const entry of buildDiagnosticSessionItems(session)) {
      expect(Object.keys(entry.item.distractorMap).length).toBeGreaterThan(0);
    }
  });

  it("scores its own generated answers", () => {
    for (const entry of buildDiagnosticSessionItems(session)) {
      expect(scoreAnswer(entry.item, entry.item.answerSpec.accepted[0] as string)).toBe(true);
    }
  });
});
