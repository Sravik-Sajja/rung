import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/diagnostics/[assignmentId]/complete/route";
import { canonicalDemoIds, canonicalDiagnosticItemIds } from "@/lib/demo/contracts";
import { getDemoPractice, recordDemoDiagnosticResponse, resetDemoLearningStore, startDemoDiagnostic } from "@/lib/student/demo-learning-store";

describe("POST /api/diagnostics/:assignmentId/complete", () => {
  const previousDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    process.env.DEMO_MODE = "true";
    resetDemoLearningStore();
  });

  afterEach(() => {
    resetDemoLearningStore();
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });

  it("replaces the seeded practice selection with the validated generated plan", async () => {
    const diagnostic = startDemoDiagnostic(canonicalDemoIds.mayaStudentId);
    const answers: Record<string, string> = {
      "equivalent-1": "4/8",
      "number-line-1": "3/4",
      "common-denominator-1": "7",
      "add-unlike-1": "7/12",
      "subtract-unlike-1": "5/12",
    };
    for (const itemId of canonicalDiagnosticItemIds) {
      recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId: canonicalDemoIds.mayaStudentId,
        itemId,
        answer: answers[itemId],
      });
    }

    const response = await POST(
      new Request("http://localhost/api/diagnostics/diagnostic-fractions/complete", {
        method: "POST",
        body: JSON.stringify({ studentId: canonicalDemoIds.mayaStudentId, diagnosticSessionId: diagnostic.diagnosticSessionId }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ assignmentId: canonicalDemoIds.diagnosticAssignmentId }) },
    );

    expect(response.status).toBe(200);
    const completed = await response.json() as { practiceSession: { id: string; itemCount: number } };
    const practice = getDemoPractice(completed.practiceSession.id, canonicalDemoIds.mayaStudentId)!;
    expect(completed.practiceSession.itemCount).toBeGreaterThanOrEqual(3);
    expect(practice.items).toHaveLength(completed.practiceSession.itemCount);
    expect(practice.items.map((item) => item.itemId)).not.toContain("common-denominator-1");
    expect(practice.items.every((item) => item.itemId.startsWith("ai-practice-"))).toBe(true);
  });
});
