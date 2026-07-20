// Covers the demo read path for the answer-safe student work-history DTO (WS1a): grouping by
// session, firstTryCount, and the "diagnostic hidden until complete" rule.
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { buildDiagnosticItems } from "@/lib/items/diagnostic-items";
import {
  completeDemoDiagnostic,
  getDemoPractice,
  recordDemoDiagnosticResponse,
  recordDemoPracticeResponse,
  resetDemoLearningStore,
  startDemoDiagnostic,
} from "@/lib/student/demo-learning-store";
import { getDemoStudentWork } from "@/lib/student/work-history";
import type { Item } from "@/lib/types";

const studentId = canonicalDemoIds.mayaStudentId;

/** Same helper `demo-learning-store.test.ts` uses: correct for every item except `missId`. */
function answerFor(item: Item, missId: string): string {
  if (item.id !== missId) return item.answerSpec.accepted[0];
  const distractor = Object.keys(item.distractorMap)[0];
  return distractor ?? "0";
}

describe("getDemoStudentWork", () => {
  beforeEach(resetDemoLearningStore);

  it("hides a diagnostic's responses until the diagnosis has been generated", () => {
    const diagnostic = startDemoDiagnostic(studentId);
    for (const item of buildDiagnosticItems(studentId)) {
      const result = recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId,
        itemId: item.id,
        answer: answerFor(item, "common-denominator-1"),
      });
      expect(result).not.toBeNull();
    }
    // Every item is answered — scored evidence exists for all five — but
    // `completeDemoDiagnostic` was never called, so no diagnosis was generated yet.
    expect(getDemoStudentWork(studentId)).toEqual([]);

    // Completing it makes the same responses visible.
    const completed = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId });
    expect(completed).not.toBeNull();
    const sessions = getDemoStudentWork(studentId);
    expect(sessions.some((session) => session.kind === "diagnostic")).toBe(true);
  });

  it("groups a completed diagnostic and practice run into sessions and computes firstTryCount", () => {
    const diagnostic = startDemoDiagnostic(studentId);
    for (const item of buildDiagnosticItems(studentId)) {
      recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId,
        itemId: item.id,
        answer: answerFor(item, "common-denominator-1"),
      });
    }
    const completed = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId })!;
    expect(completed.practiceSession.itemCount).toBe(4);

    const practice = getDemoPractice(completed.practiceSession.id, studentId)!;
    const [first, second, third, fourth] = practice.items;

    // Miss the first item, then retry it correctly — a retried item must not count toward
    // firstTryCount even though it eventually resolves correct.
    const miss = recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: first.practiceSessionItemId, studentId, answer: "wrong" });
    expect(miss?.isCorrect).toBe(false);
    const retry = recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: first.practiceSessionItemId, studentId, answer: "12" });
    expect(retry?.isCorrect).toBe(true);
    recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: second.practiceSessionItemId, studentId, answer: "15" });
    recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: third.practiceSessionItemId, studentId, answer: "7/12" });
    recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: fourth.practiceSessionItemId, studentId, answer: "11/15" });

    const sessions = getDemoStudentWork(studentId);
    expect(sessions).toHaveLength(2);

    const practiceSession = sessions.find((session) => session.kind === "practice");
    expect(practiceSession).toBeDefined();
    expect(practiceSession!.totalCount).toBe(4);
    // Three of the four items were correct on the first try; the retried item was not.
    expect(practiceSession!.firstTryCount).toBe(3);
    const firstItemAttempts = practiceSession!.items.filter((item) => item.itemId === first.itemId);
    expect(firstItemAttempts).toHaveLength(2);
    expect(firstItemAttempts.find((attempt) => attempt.attempt === 1)).toMatchObject({ isCorrect: false, answerRaw: "wrong" });
    expect(firstItemAttempts.find((attempt) => attempt.attempt === 2)).toMatchObject({ isCorrect: true, answerRaw: "12" });
    // Answer-safe DTO: every item still carries a correct-answer string and a friendly subskill title.
    expect(practiceSession!.items.every((item) => item.correctAnswer.length > 0 && item.subskillTitle.length > 0)).toBe(true);

    const diagnosticSession = sessions.find((session) => session.kind === "diagnostic");
    expect(diagnosticSession).toBeDefined();
    expect(diagnosticSession!.totalCount).toBe(5);
    // Only "common-denominator-1" was deliberately missed.
    expect(diagnosticSession!.firstTryCount).toBe(4);
    const numberLineItem = diagnosticSession!.items.find((item) => item.itemId === "number-line-1");
    expect(numberLineItem?.visualSpec).toMatchObject({ kind: "number_line" });
  });

  it("hides an in-progress (unresolved) practice run", () => {
    const diagnostic = startDemoDiagnostic(studentId);
    for (const item of buildDiagnosticItems(studentId)) {
      recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId,
        itemId: item.id,
        answer: answerFor(item, "common-denominator-1"),
      });
    }
    const completed = completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId })!;
    const practice = getDemoPractice(completed.practiceSession.id, studentId)!;
    // Answer only the first item; the session is still active.
    recordDemoPracticeResponse({ practiceSessionId: completed.practiceSession.id, practiceSessionItemId: practice.items[0].practiceSessionItemId, studentId, answer: "12" });

    const sessions = getDemoStudentWork(studentId);
    expect(sessions.some((session) => session.kind === "practice")).toBe(false);
  });
});
