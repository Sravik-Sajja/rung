import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tutorHint: vi.fn(),
  requireStudentActor: vi.fn(),
}));

vi.mock("@/lib/ai/adapter", () => ({
  runtimeAiAdapter: { tutorHint: mocks.tutorHint },
}));

vi.mock("@/lib/auth/actor", () => ({
  requireStudentActor: mocks.requireStudentActor,
}));

import { POST } from "@/app/api/tutor/hint/route";
import {
  applyGeneratedDemoPracticePlan,
  claimDemoPracticeWorkHelp,
  createGeneratedDemoPracticeSession,
  getDemoPractice,
  recordDemoPracticeResponse,
  resetDemoLearningStore,
} from "@/lib/student/demo-learning-store";

const safeHint = {
  level: "hint" as const,
  hint: "Try listing a few multiples for each denominator.",
  source: "fallback" as const,
  promptVersion: "tutor-v1",
  aiRunId: "test-hint",
  leakCheck: "fallback" as const,
};

function createGeneratedPractice(studentId = "maya-chen") {
  const practiceSessionId = createGeneratedDemoPracticeSession(studentId);
  const applied = applyGeneratedDemoPracticePlan({
    practiceSessionId,
    studentId,
    targetSubskillId: "add-unlike-denominators",
    items: [
      { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 },
      { kind: "fraction_operation", operation: "add", leftNumerator: 2, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
      { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 6, rightNumerator: 1, rightDenominator: 4 },
    ],
  });
  expect(applied).not.toBeNull();
  const practice = getDemoPractice(practiceSessionId, studentId);
  const first = practice?.items[0];
  if (!first) throw new Error("Expected generated practice occurrence.");
  return { practiceSessionId, first };
}

function createRequest(values: Record<string, string> = {}) {
  return new Request("http://localhost/api/tutor/hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      studentId: values.studentId ?? "maya-chen",
      itemId: values.itemId,
      practiceSessionId: values.practiceSessionId,
      practiceSessionItemId: values.practiceSessionItemId,
      attempt: values.attempt ?? "I tried adding the denominators.",
      level: values.level ?? "hint",
    }),
  });
}

describe("POST /api/tutor/hint", () => {
  beforeEach(() => {
    resetDemoLearningStore();
    mocks.tutorHint.mockReset();
    mocks.requireStudentActor.mockReset();
    mocks.requireStudentActor.mockResolvedValue({ studentId: "maya-chen", mode: "demo", store: "local_demo" });
    mocks.tutorHint.mockResolvedValue(safeHint);
  });

  it("uses the owned generated occurrence rather than an untrusted catalog item ID", async () => {
    const { practiceSessionId, first } = createGeneratedPractice();
    const response = await POST(createRequest({
      itemId: "common-denominator-1",
      practiceSessionId,
      practiceSessionItemId: first.practiceSessionItemId,
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireStudentActor).toHaveBeenCalledWith(expect.any(Request), "maya-chen");
    expect(mocks.tutorHint).toHaveBeenCalledWith(expect.objectContaining({
      item: expect.objectContaining({ id: first.itemId }),
      protection: expect.objectContaining({
        protectedAnswers: ["7/12"],
        protectedSolutionSteps: expect.any(Array),
      }),
    }));
  });

  it("records a substantive hint only after resolving the owned occurrence", async () => {
    const { practiceSessionId, first } = createGeneratedPractice();
    expect(recordDemoPracticeResponse({
      practiceSessionId,
      practiceSessionItemId: first.practiceSessionItemId,
      studentId: "maya-chen",
      answer: "0",
    })?.isCorrect).toBe(false);

    const response = await POST(createRequest({
      practiceSessionId,
      practiceSessionItemId: first.practiceSessionItemId,
      level: "hint",
    }));
    expect(response.status).toBe(200);

    // The later miss completes the exact server-recorded sequence. If the
    // route had not persisted the owned hint request, this claim would fail.
    expect(recordDemoPracticeResponse({
      practiceSessionId,
      practiceSessionItemId: first.practiceSessionItemId,
      studentId: "maya-chen",
      answer: "0",
    })?.isCorrect).toBe(false);
    expect(claimDemoPracticeWorkHelp({
      practiceSessionId,
      practiceSessionItemId: first.practiceSessionItemId,
      studentId: "maya-chen",
    })).toEqual(expect.any(String));
  });

  it("rejects a practice session owned by another learner", async () => {
    const { practiceSessionId, first } = createGeneratedPractice("diego-alvarez");
    const response = await POST(createRequest({
      practiceSessionId,
      practiceSessionItemId: first.practiceSessionItemId,
    }));

    expect(response.status).toBe(403);
    expect(mocks.tutorHint).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown practice session or occurrence", async () => {
    const response = await POST(createRequest({
      practiceSessionId: "missing-session",
      practiceSessionItemId: "missing-occurrence",
    }));

    expect(response.status).toBe(404);
    expect(mocks.tutorHint).not.toHaveBeenCalled();
  });

  it("rejects a partial session target instead of falling back to a catalog ID", async () => {
    const response = await POST(createRequest({
      itemId: "common-denominator-1",
      practiceSessionId: "demo-practice-1",
    }));

    expect(response.status).toBe(400);
    expect(mocks.requireStudentActor).not.toHaveBeenCalled();
  });
});
