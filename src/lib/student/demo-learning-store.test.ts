import { describe, expect, it } from "vitest";
import { completeDemoDiagnostic, getDemoPractice, recordDemoDiagnosticResponse, recordDemoPracticeResponse, startDemoDiagnostic } from "@/lib/student/demo-learning-store";
import { canonicalDemoIds, canonicalDiagnosticItemIds } from "@/lib/demo/contracts";

describe("demo diagnostic to practice journey", () => {
  it("creates common-denominator practice from Maya's diagnostic miss", () => {
    const diagnostic = startDemoDiagnostic(canonicalDemoIds.mayaStudentId);
    const answers: Record<string, string> = {
      "equivalent-1": "4/8",
      "number-line-1": "3/4",
      "common-denominator-1": "7",
      "add-unlike-1": "7/12",
      "subtract-unlike-1": "5/12",
    };
    for (const itemId of canonicalDiagnosticItemIds) {
      expect(recordDemoDiagnosticResponse({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId, itemId, answer: answers[itemId] })).not.toBeNull();
    }
    const completed = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId });
    expect(completed?.diagnosis.selectedSubskillId).toBe(canonicalDemoIds.commonDenominatorSubskillId);
    expect(completed?.practiceSession.itemCount).toBe(4);
    const practice = getDemoPractice(completed!.practiceSession.id, canonicalDemoIds.mayaStudentId)!;
    expect(practice.items.map((item) => item.itemId)).toEqual(["common-denominator-1", "common-denominator-2", "add-unlike-1", "add-unlike-2"]);
  });

  it("advances after a correct answer and requeues a missed item once", () => {
    const diagnostic = startDemoDiagnostic(canonicalDemoIds.mayaStudentId);
    for (const [itemId, answer] of Object.entries({ "equivalent-1": "4/8", "number-line-1": "3/4", "common-denominator-1": "7", "add-unlike-1": "7/12", "subtract-unlike-1": "5/12" })) {
      recordDemoDiagnosticResponse({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: canonicalDemoIds.mayaStudentId, itemId, answer });
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
});
