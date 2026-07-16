import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeWork: vi.fn(),
  requireStudentActor: vi.fn(),
}));

vi.mock("@/lib/ai/adapter", () => ({
  runtimeAiAdapter: { analyzeWork: mocks.analyzeWork },
}));

vi.mock("@/lib/auth/actor", () => ({
  requireStudentActor: mocks.requireStudentActor,
}));

import { POST } from "@/app/api/work-help/route";
import {
  applyGeneratedDemoPracticePlan,
  createGeneratedDemoPracticeSession,
  getDemoPractice,
  recordDemoPracticeResponse,
  recordDemoPracticeSupportHint,
  resetDemoLearningStore,
} from "@/lib/student/demo-learning-store";

const validAnalysis = {
  observation: "You started by looking for a number both denominators share.",
  nextStep: "Write two short lists of multiples and compare them.",
  checkQuestion: "Which multiple appears in both lists?",
  imageRead: "not_provided" as const,
  source: "fallback" as const,
  promptVersion: "work-help-v1-guided_step",
  aiRunId: "test-run",
  leakCheck: "fallback" as const,
};

type DemoTarget = { practiceSessionId: string; first: { practiceSessionItemId: string; itemId: string } };

function createRequest(values: Record<string, string> = {}, photo?: Blob) {
  const form = new FormData();
  form.set("studentId", values.studentId ?? "maya-chen");
  form.set("itemId", values.itemId ?? "common-denominator-1");
  form.set("writtenWork", values.writtenWork ?? "I listed 3, 6, 9 and 4, 8, 12.");
  form.set("supportLevel", values.supportLevel ?? "guided_step");
  if (values.practiceSessionId) form.set("practiceSessionId", values.practiceSessionId);
  if (values.practiceSessionItemId) form.set("practiceSessionItemId", values.practiceSessionItemId);
  if (photo) form.set("photo", photo, "work.png");
  return new Request("http://localhost/api/work-help", { method: "POST", body: form });
}

function requestFor(target: DemoTarget, values: Record<string, string> = {}, photo?: Blob) {
  return createRequest({
    practiceSessionId: target.practiceSessionId,
    practiceSessionItemId: target.first.practiceSessionItemId,
    ...values,
  }, photo);
}

function createGeneratedPractice(studentId = "maya-chen"): DemoTarget {
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

function recordMiss(target: DemoTarget) {
  const response = recordDemoPracticeResponse({
    practiceSessionId: target.practiceSessionId,
    practiceSessionItemId: target.first.practiceSessionItemId,
    studentId: "maya-chen",
    answer: "0",
  });
  expect(response?.isCorrect).toBe(false);
}

function recordHint(target: DemoTarget, level: "nudge" | "hint" | "guided_step") {
  expect(recordDemoPracticeSupportHint({
    practiceSessionId: target.practiceSessionId,
    practiceSessionItemId: target.first.practiceSessionItemId,
    studentId: "maya-chen",
    level,
  })).toBe(true);
}

function createEligiblePractice() {
  const target = createGeneratedPractice();
  recordMiss(target);
  recordHint(target, "guided_step");
  recordMiss(target);
  return target;
}

describe("POST /api/work-help", () => {
  beforeEach(() => {
    resetDemoLearningStore();
    mocks.requireStudentActor.mockReset();
    mocks.analyzeWork.mockReset();
    mocks.requireStudentActor.mockResolvedValue({ studentId: "maya-chen", mode: "demo", store: "local_demo" });
    mocks.analyzeWork.mockResolvedValue(validAnalysis);
  });

  it("rejects work help before the server has recorded the escalation sequence", async () => {
    const target = createGeneratedPractice();
    const response = await POST(requestFor(target));

    expect(response.status).toBe(409);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("does not unlock work help after only a nudge", async () => {
    const target = createGeneratedPractice();
    recordMiss(target);
    recordHint(target, "nudge");
    recordMiss(target);

    const response = await POST(requestFor(target));

    expect(response.status).toBe(409);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("requires a later missed response after a substantive hint", async () => {
    const target = createGeneratedPractice();
    recordMiss(target);
    recordHint(target, "hint");

    const response = await POST(requestFor(target));

    expect(response.status).toBe(409);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("allows one server-claimed response after miss, hint, and a later miss", async () => {
    const target = createEligiblePractice();

    const response = await POST(requestFor(target));

    expect(response.status).toBe(200);
    expect(mocks.analyzeWork).toHaveBeenCalledWith(expect.objectContaining({
      item: expect.objectContaining({ id: target.first.itemId }),
    }));
  });

  it("rejects a repeat claim for the same logical practice item", async () => {
    const target = createEligiblePractice();
    expect((await POST(requestFor(target))).status).toBe(200);

    const repeat = await POST(requestFor(target));

    expect(repeat.status).toBe(409);
    expect(mocks.analyzeWork).toHaveBeenCalledTimes(1);
  });

  it("releases a claim when the adapter fails so the learner may retry", async () => {
    const target = createEligiblePractice();
    mocks.analyzeWork.mockRejectedValueOnce(new Error("temporary outage"));

    expect((await POST(requestFor(target))).status).toBe(500);
    expect((await POST(requestFor(target))).status).toBe(200);
  });

  it("sends protected context to the adapter but never echoes a learner's work", async () => {
    const target = createEligiblePractice();
    const response = await POST(requestFor(target));

    expect(response.status).toBe(200);
    expect(mocks.requireStudentActor).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeWork).toHaveBeenCalledWith(expect.objectContaining({
      studentId: "maya-chen",
      writtenWork: "I listed 3, 6, 9 and 4, 8, 12.",
      protectedAnswers: ["7/12"],
      protectedSolutionSteps: expect.any(Array),
      imageDataUrl: undefined,
      promptVersion: "work-help-v1-guided_step",
    }));

    const body = await response.json();
    expect(body).toMatchObject({
      observation: validAnalysis.observation,
      nextStep: validAnalysis.nextStep,
      checkQuestion: validAnalysis.checkQuestion,
    });
    expect(JSON.stringify(body)).not.toContain("I listed 3, 6, 9 and 4, 8, 12.");
    expect(body).not.toHaveProperty("protectedAnswers");
    expect(body).not.toHaveProperty("protectedSolutionSteps");
  });

  it("rejects missing or too-short written work before invoking the AI", async () => {
    const response = await POST(createRequest({ writtenWork: "hi" }));
    expect(response.status).toBe(400);
    expect(mocks.requireStudentActor).not.toHaveBeenCalled();
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("rejects an unsupported photo type before it reserves a claim", async () => {
    const target = createEligiblePractice();
    const response = await POST(requestFor(target, {}, new Blob(["not an image"], { type: "text/plain" })));
    expect(response.status).toBe(415);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
    expect((await POST(requestFor(target))).status).toBe(200);
  });

  it("rejects a PNG whose contents are not a PNG image", async () => {
    const target = createEligiblePractice();
    const response = await POST(requestFor(target, {}, new Blob(["not an image"], { type: "image/png" })));
    expect(response.status).toBe(415);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("passes an accepted image to the adapter as an in-memory data URL", async () => {
    const target = createEligiblePractice();
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = await POST(requestFor(target, {}, new Blob([pngHeader], { type: "image/png" })));
    expect(response.status).toBe(200);
    expect(mocks.analyzeWork).toHaveBeenCalledWith(expect.objectContaining({
      imageDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
    }));
  });

  it("rejects an oversized multipart request before parsing or calling the AI", async () => {
    const response = await POST(new Request("http://localhost/api/work-help", {
      method: "POST",
      headers: { "content-length": String((5 * 1024 * 1024) + (64 * 1024) + 1) },
      body: "too large",
    }));
    expect(response.status).toBe(413);
    expect(mocks.requireStudentActor).not.toHaveBeenCalled();
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("requires the requested learner to be authorized", async () => {
    const target = createEligiblePractice();
    mocks.requireStudentActor.mockRejectedValue(new Error("Unknown demo student."));
    const response = await POST(requestFor(target));
    expect(response.status).toBe(403);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("rejects another learner's practice session", async () => {
    const target = createGeneratedPractice("diego-alvarez");
    const response = await POST(requestFor(target, { studentId: "maya-chen" }));

    expect(response.status).toBe(403);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("returns not found for an unknown owned practice occurrence", async () => {
    const target = createGeneratedPractice();
    const response = await POST(requestFor(target, { practiceSessionItemId: "missing-occurrence" }));

    expect(response.status).toBe(404);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });
});
