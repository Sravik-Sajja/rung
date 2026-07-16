import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/diagnostics/[assignmentId]/complete/route";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { buildDiagnosticItems } from "@/lib/items/diagnostic-items";
import { getDemoPractice, recordDemoDiagnosticResponse, resetDemoLearningStore, startDemoDiagnostic } from "@/lib/student/demo-learning-store";
import type { Item } from "@/lib/types";

function answerFor(item: Item, missId: string): string {
  if (item.id !== missId) return item.answerSpec.accepted[0];
  return Object.keys(item.distractorMap)[0] ?? "0";
}

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
    for (const item of buildDiagnosticItems(canonicalDemoIds.mayaStudentId)) {
      recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId: canonicalDemoIds.mayaStudentId,
        itemId: item.id,
        answer: answerFor(item, "common-denominator-1"),
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
    const completed = await response.json() as {
      practiceSession: { id: string; firstItemId: string; itemCount: number };
      practicePlans: Array<{ id: string; itemCount: number }>;
    };
    const practice = getDemoPractice(completed.practiceSession.id, canonicalDemoIds.mayaStudentId)!;
    expect(completed.practiceSession.itemCount).toBeGreaterThanOrEqual(3);
    expect(completed.practiceSession.firstItemId).toBe(practice.items[0].itemId);
    expect(completed.practiceSession.firstItemId).not.toBe(completed.practicePlans[0].id);
    expect(practice.items).toHaveLength(completed.practiceSession.itemCount);
    expect(practice.items.map((item) => item.itemId)).not.toContain("common-denominator-1");
    expect(practice.items.every((item) => item.itemId.startsWith("ai-practice-"))).toBe(true);

    const retry = await POST(
      new Request("http://localhost/api/diagnostics/diagnostic-fractions/complete", {
        method: "POST",
        body: JSON.stringify({ studentId: canonicalDemoIds.mayaStudentId, diagnosticSessionId: diagnostic.diagnosticSessionId }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ assignmentId: canonicalDemoIds.diagnosticAssignmentId }) },
    );
    const retried = await retry.json() as typeof completed;
    expect(retry.status).toBe(200);
    expect(retried.practicePlans).toEqual(completed.practicePlans);
    expect(retried.practiceSession).toEqual(completed.practiceSession);
  });
});
