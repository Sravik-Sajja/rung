// Covers the trust boundaries for the deterministic demo fallback used by the missing Track A routes.
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { completeLocalDiagnostic, getLocalPeerSolution, getLocalPracticeSession, recordLocalResponse, resetLocalDemoFlow, submitLocalPeerAttempt } from "@/lib/student/demo-flow";

const maya = canonicalDemoIds.mayaStudentId;

describe("student demo flow", () => {
  beforeEach(resetLocalDemoFlow);

  it("turns a supported diagnostic distractor into Maya's common-denominator practice session", async () => {
    recordLocalResponse({ studentId: maya, itemId: "diagnostic-add-unlike-1", answer: "2/7", context: "diagnostic" });
    const completed = await completeLocalDiagnostic(canonicalDemoIds.diagnosticAssignmentId, maya);
    expect(completed && "diagnosis" in completed && completed.diagnosis.selectedSubskillId).toBe("find-common-denominator");
    if (!completed || "error" in completed) throw new Error("Expected diagnostic completion");
    const session = getLocalPracticeSession(completed.practiceSession.id, maya);
    expect(session?.items.map((item) => item.itemId)).toEqual(["common-denominator-1", "add-unlike-1", "subtract-unlike-1"]);
    expect(session?.items[0]).not.toHaveProperty("answerSpec");
  });

  it("recovers the canonical seeded practice session when route handlers do not share local memory", () => {
    const session = getLocalPracticeSession("practice-maya-chen-common-denominator", maya);
    expect(session?.session.currentItemId).toBe("common-denominator-1");
  });

  it("keeps peer content locked for a poor attempt and unlocks only the approach for a meaningful one", async () => {
    const poor = await submitLocalPeerAttempt({ studentId: maya, itemId: "add-unlike-1", attemptText: "idk", explanation: "help" });
    expect(poor?.unlocks.approachUnlocked).toBe(false);
    expect(getLocalPeerSolution(maya, "add-unlike-1")?.access).toBe("locked");

    const meaningful = await submitLocalPeerAttempt({ studentId: maya, itemId: "add-unlike-1", attemptText: "I changed the denominators to 12.", explanation: "I tried to rewrite both fractions as twelfths before adding." });
    expect(meaningful?.unlocks.approachUnlocked).toBe(true);
    expect(meaningful?.unlocks.fullSolutionUnlocked).toBe(false);
    expect(getLocalPeerSolution(maya, "add-unlike-1")?.access).toBe("approach");
  });

  it("unlocks a full peer solution only after a correct deterministic score", async () => {
    await submitLocalPeerAttempt({ studentId: maya, itemId: "add-unlike-1", attemptText: "I changed the denominators to 12.", explanation: "I tried to rewrite both fractions as twelfths before adding." });
    recordLocalResponse({ studentId: maya, itemId: "add-unlike-1", answer: "7/12", context: "practice" });
    expect(getLocalPeerSolution(maya, "add-unlike-1")?.access).toBe("full_solution");
  });
});
