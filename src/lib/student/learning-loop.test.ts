import { describe, expect, it } from "vitest";
import { collectDiagnosticEvidence, nextMasteryLevel, selectDiagnosticGap, selectPracticeItems, shouldRequeue } from "@/lib/student/learning-loop";
import type { Item } from "@/lib/types";

const items: Item[] = [
  { id: "common-1", subskillId: "common", prompt: "Find a denominator", answerSpec: { accepted: ["12"] }, distractorMap: { "7": "adds_denominators" } },
  { id: "add-1", subskillId: "add", prompt: "Add fractions", answerSpec: { accepted: ["7/12"] }, distractorMap: { "2/7": "adds_numerators_and_denominators" } },
  { id: "common-2", subskillId: "common", prompt: "Find another denominator", answerSpec: { accepted: ["15"] }, distractorMap: {} },
  { id: "add-2", subskillId: "add", prompt: "Add another pair", answerSpec: { accepted: ["11/15"] }, distractorMap: {} },
];

const prerequisites = new Map<string, string | null>([["common", null], ["add", "common"]]);

describe("diagnostic-driven practice loop", () => {
  it("selects a missed prerequisite before its dependent skill", () => {
    const evidence = collectDiagnosticEvidence(items.slice(0, 2), new Map([
      ["common-1", { answer: "7", isCorrect: false }],
      ["add-1", { answer: "2/7", isCorrect: false }],
    ]));
    expect(selectDiagnosticGap(evidence, prerequisites)).toMatchObject({ subskillId: "common", misconceptionTag: "adds_denominators" });
  });

  it("selects primary practice before dependent target practice", () => {
    expect(selectPracticeItems(items, "common", prerequisites).map((item) => item.id)).toEqual(["common-1", "common-2", "add-1", "add-2"]);
  });

  it("requeues only one missed occurrence and never drops mastery on one miss", () => {
    expect(shouldRequeue(["missed"])).toBe(false);
    expect(shouldRequeue(["pending"])).toBe(true);
    expect(nextMasteryLevel("mastered", 2, false, false)).toEqual({ level: "mastered", evidenceCount: 3 });
  });
});
