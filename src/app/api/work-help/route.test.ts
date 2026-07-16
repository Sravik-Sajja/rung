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

function createRequest(values: Record<string, string> = {}, photo?: Blob) {
  const form = new FormData();
  form.set("studentId", values.studentId ?? "maya-chen");
  form.set("itemId", values.itemId ?? "common-denominator-1");
  form.set("writtenWork", values.writtenWork ?? "I listed 3, 6, 9 and 4, 8, 12.");
  form.set("supportLevel", values.supportLevel ?? "guided_step");
  if (photo) form.set("photo", photo, "work.png");
  return new Request("http://localhost/api/work-help", { method: "POST", body: form });
}

describe("POST /api/work-help", () => {
  beforeEach(() => {
    mocks.requireStudentActor.mockReset();
    mocks.analyzeWork.mockReset();
    mocks.requireStudentActor.mockResolvedValue({ studentId: "maya-chen", mode: "demo" });
    mocks.analyzeWork.mockResolvedValue(validAnalysis);
  });

  it("sends protected context to the adapter but never echoes a learner's work", async () => {
    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    expect(mocks.requireStudentActor).toHaveBeenCalledTimes(1);
    expect(mocks.analyzeWork).toHaveBeenCalledWith(expect.objectContaining({
      studentId: "maya-chen",
      writtenWork: "I listed 3, 6, 9 and 4, 8, 12.",
      protectedAnswers: ["12"],
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

  it("rejects an unsupported photo type without invoking the AI", async () => {
    const response = await POST(createRequest({}, new Blob(["not an image"], { type: "text/plain" })));
    expect(response.status).toBe(415);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("rejects a PNG whose contents are not a PNG image", async () => {
    const response = await POST(createRequest({}, new Blob(["not an image"], { type: "image/png" })));
    expect(response.status).toBe(415);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });

  it("passes an accepted image to the adapter as an in-memory data URL", async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = await POST(createRequest({}, new Blob([pngHeader], { type: "image/png" })));
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
    mocks.requireStudentActor.mockRejectedValue(new Error("Unknown demo student."));
    const response = await POST(createRequest());
    expect(response.status).toBe(403);
    expect(mocks.analyzeWork).not.toHaveBeenCalled();
  });
});
