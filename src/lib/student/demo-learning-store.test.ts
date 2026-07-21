import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGeneratedDemoPracticePlan, assignDemoTeacherPractice, completeDemoDiagnostic, getDemoAssignedFollowUps, getDemoCurrentDiagnostic, getDemoLearnerResume, getDemoPractice, getDemoStudentMastery, recordDemoDiagnosticResponse, recordDemoPracticeResponse, resetDemoLearningStore, startDemoDiagnostic } from "@/lib/student/demo-learning-store";
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

  it("resumes the same diagnostic at its first unanswered item instead of creating another run", () => {
    const studentId = "demo-learner-resume";
    const first = startDemoDiagnostic(studentId);
    const firstItem = buildDiagnosticItems(studentId)[0]!;
    recordDemoDiagnosticResponse({
      diagnosticSessionId: first.diagnosticSessionId,
      studentId,
      itemId: firstItem.id,
      answer: firstItem.answerSpec.accepted[0],
    });

    const resumed = startDemoDiagnostic(studentId);
    expect(resumed.diagnosticSessionId).toBe(first.diagnosticSessionId);
    expect(resumed.answeredItemIds).toEqual([firstItem.id]);
    expect(getDemoLearnerResume(studentId)).toEqual({ kind: "diagnostic", diagnosticSessionId: first.diagnosticSessionId });
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

describe("teacher-assigned practice (WS1a)", () => {
  beforeEach(resetDemoLearningStore);
  afterEach(resetDemoLearningStore);

  it("creates a real three-item practice session for a teacher's assign-follow-up action", () => {
    const studentId = "demo-teacher-assign-create";
    const result = assignDemoTeacherPractice({ studentId, classId: canonicalDemoIds.classId, subskillId: "equivalent-fractions", teacherName: "Ms. Rivera" });
    expect(result).toMatchObject({ subskillId: "equivalent-fractions", studentId, alreadyAssigned: false });

    const practice = getDemoPractice(result.planId, studentId);
    expect(practice?.items.map((item) => item.itemId)).toEqual(["equivalent-1", "equivalent-2", "equivalent-3"]);
    expect(practice?.session.status).toBe("active");
  });

  it("is idempotent: a second assignment for the same student and skill returns the same plan instead of duplicating it", () => {
    const studentId = "demo-teacher-assign-idempotent";
    const first = assignDemoTeacherPractice({ studentId, classId: canonicalDemoIds.classId, subskillId: "add-unlike-denominators", teacherName: "Ms. Rivera" });
    const second = assignDemoTeacherPractice({ studentId, classId: canonicalDemoIds.classId, subskillId: "add-unlike-denominators", teacherName: "Ms. Rivera" });

    expect(second).toEqual({ planId: first.planId, subskillId: "add-unlike-denominators", studentId, alreadyAssigned: true });
    expect(getDemoAssignedFollowUps([studentId])).toEqual([{ studentId, subskillId: "add-unlike-denominators" }]);
  });

  it("surfaces an assigned plan in getDemoCurrentDiagnostic with source \"teacher\", alongside the student's diagnostic plans", () => {
    const studentId = canonicalDemoIds.mayaStudentId;
    const diagnostic = startDemoDiagnostic(studentId);
    for (const item of buildDiagnosticItems(studentId)) {
      recordDemoDiagnosticResponse({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId, itemId: item.id, answer: answerFor(item, "common-denominator-1") });
    }
    completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId });
    const assigned = assignDemoTeacherPractice({ studentId, classId: canonicalDemoIds.classId, subskillId: "subtract-unlike-denominators", teacherName: "Ms. Rivera" });

    const current = getDemoCurrentDiagnostic(studentId);
    expect(current.diagnosticSessionId).toBe(diagnostic.diagnosticSessionId);
    expect(current.practicePlans).toContainEqual(expect.objectContaining({
      id: assigned.planId,
      targetSubskillId: "subtract-unlike-denominators",
      source: "teacher",
      status: "active",
    }));
    expect(current.practicePlans.some((plan) => plan.source === "diagnostic")).toBe(true);
  });

  it("still returns the assigned plan, with a null diagnosticSessionId, for a student who has never completed a diagnostic", () => {
    const studentId = "demo-teacher-assign-only";
    const assigned = assignDemoTeacherPractice({ studentId, classId: canonicalDemoIds.classId, subskillId: "equivalent-fractions", teacherName: "Ms. Rivera" });

    const current = getDemoCurrentDiagnostic(studentId);
    expect(current.diagnosticSessionId).toBeNull();
    expect(current.practicePlans).toEqual([
      expect.objectContaining({ id: assigned.planId, targetSubskillId: "equivalent-fractions", source: "teacher" }),
    ]);
  });

  it("throws rather than assigning an incomplete set when a skill does not have three bank items", () => {
    expect(() => assignDemoTeacherPractice({
      studentId: "demo-teacher-assign-sparse",
      classId: canonicalDemoIds.classId,
      subskillId: canonicalDemoIds.commonDenominatorSubskillId,
      teacherName: "Ms. Rivera",
    })).toThrow();
  });
});
