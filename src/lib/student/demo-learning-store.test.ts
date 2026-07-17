import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGeneratedDemoPracticePlan, completeDemoDiagnostic, getDemoPractice, getDemoStudentMastery, recordDemoDiagnosticResponse, recordDemoPracticeResponse, resetDemoLearningStore, startDemoDiagnostic } from "@/lib/student/demo-learning-store";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { buildDiagnosticItems } from "@/lib/items/diagnostic-items";
import type { Item } from "@/lib/types";

/**
 * Diagnostic numbers are per student now, so answers are derived from the learner's own items
 * instead of hardcoded. `missId` gets that item's registered misconception distractor; everything
 * else gets its correct answer.
 */
function answerFor(item: Item, missId: string): string {
  if (item.id !== missId) return item.answerSpec.accepted[0];
  const distractor = Object.keys(item.distractorMap)[0];
  // Every pooled pair registers a distractor; fall back to a value no item ever accepts.
  return distractor ?? "0";
}

describe("demo diagnostic to practice journey", () => {
  beforeEach(resetDemoLearningStore);
  afterEach(resetDemoLearningStore);

  it("creates common-denominator practice from Maya's diagnostic miss", () => {
    const diagnostic = startDemoDiagnostic(canonicalDemoIds.mayaStudentId);
    for (const item of buildDiagnosticItems(canonicalDemoIds.mayaStudentId)) {
      expect(recordDemoDiagnosticResponse({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId, itemId: item.id, answer: answerFor(item, "common-denominator-1") })).not.toBeNull();
    }
    const completed = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId });
    expect(completed?.diagnosis.selectedSubskillId).toBe(canonicalDemoIds.commonDenominatorSubskillId);
    expect(completed?.practiceSession.itemCount).toBe(4);
    const practice = getDemoPractice(completed!.practiceSession.id, canonicalDemoIds.mayaStudentId)!;
    expect(practice.items.map((item) => item.itemId)).toEqual(["common-denominator-1", "common-denominator-2", "add-unlike-1", "add-unlike-2"]);
  });

  it("projects a completed local diagnostic into one canonical mastery state exactly once", () => {
    const studentId = "demo-learner-projection";
    const diagnostic = startDemoDiagnostic(studentId);
    for (const item of buildDiagnosticItems(studentId)) {
      recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId,
        itemId: item.id,
        answer: answerFor(item, "common-denominator-1"),
      });
    }

    const first = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId })!;
    const second = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId })!;
    expect(second).toBe(first);

    const mastery = getDemoStudentMastery(studentId);
    expect(mastery.find((entry) => entry.subskillId === "find-common-denominator")).toMatchObject({ level: "needs_support" });
    expect(mastery.find((entry) => entry.subskillId === "equivalent-fractions")).toMatchObject({ level: "developing" });
    expect(mastery.find((entry) => entry.subskillId === "subtract-unlike-denominators")).toMatchObject({ level: "developing" });
  });

  it("advances after a correct answer and requeues a missed item once", () => {
    const diagnostic = startDemoDiagnostic(canonicalDemoIds.mayaStudentId);
    for (const item of buildDiagnosticItems(canonicalDemoIds.mayaStudentId)) {
      recordDemoDiagnosticResponse({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId, itemId: item.id, answer: answerFor(item, "common-denominator-1") });
    }
    const completed = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId })!;
    const initial = getDemoPractice(completed.practiceSession.id, canonicalDemoIds.mayaStudentId)!;
    const first = initial.items[0];
    const miss = recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: first.practiceSessionItemId, studentId: canonicalDemoIds.mayaStudentId, answer: "7" })!;
    expect(miss.isCorrect).toBe(false);
    expect(miss.practice.items.filter((item) => item.itemId === first.itemId)).toHaveLength(2);
    const retry = recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: first.practiceSessionItemId, studentId: canonicalDemoIds.mayaStudentId, answer: "12" })!;
    expect(retry.isCorrect).toBe(true);
    expect(retry.practice.session.currentItemId).toBe("common-denominator-2");
  });

  it("keeps an active diagnostic available after a Next development module reload", async () => {
    const first = await import("@/lib/student/demo-learning-store");
    first.resetDemoLearningStore();
    const diagnostic = first.startDemoDiagnostic(canonicalDemoIds.mayaStudentId);

    vi.resetModules();
    const reloaded = await import("@/lib/student/demo-learning-store");
    const equivalent = buildDiagnosticItems(canonicalDemoIds.mayaStudentId).find((item) => item.id === "equivalent-1")!;
    const response = reloaded.recordDemoDiagnosticResponse({
      diagnosticSessionId: diagnostic.diagnosticSessionId,
      studentId: canonicalDemoIds.mayaStudentId,
      itemId: equivalent.id,
      answer: equivalent.answerSpec.accepted[0],
    });

    expect(response).toMatchObject({ isCorrect: true });
  });

  it("uses server-validated generated parameters to replace a newly created practice plan", () => {
    const diagnostic = startDemoDiagnostic(canonicalDemoIds.mayaStudentId);
    for (const item of buildDiagnosticItems(canonicalDemoIds.mayaStudentId)) {
      recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId: canonicalDemoIds.mayaStudentId,
        itemId: item.id,
        answer: answerFor(item, "common-denominator-1"),
      });
    }
    const completed = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId })!;
    const applied = applyGeneratedDemoPracticePlan({ practiceSessionId: completed.practiceSession.id, studentId: canonicalDemoIds.mayaStudentId, targetSubskillId: "find-common-denominator", items: [
      { kind: "common_denominator", leftDenominator: 3, rightDenominator: 4 },
      { kind: "common_denominator", leftDenominator: 4, rightDenominator: 5 },
      { kind: "common_denominator", leftDenominator: 3, rightDenominator: 5 },
    ] });
    expect(applied?.itemCount).toBe(3);
    expect(getDemoPractice(completed.practiceSession.id, canonicalDemoIds.mayaStudentId)?.items[0].prompt).toBe("What is a common denominator for 1/3 and 1/4?");
  });
});
