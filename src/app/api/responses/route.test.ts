import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStudentActor: vi.fn(),
  recordDemoDiagnosticResponse: vi.fn(),
  recordDemoPracticeResponse: vi.fn(),
  recordPersistedDiagnosticResponse: vi.fn(),
  recordPersistedPracticeResponse: vi.fn(),
}));

vi.mock("@/lib/auth/actor", () => ({ requireStudentActor: mocks.requireStudentActor }));
vi.mock("@/lib/student/demo-learning-store", () => ({
  recordDemoDiagnosticResponse: mocks.recordDemoDiagnosticResponse,
  recordDemoPracticeResponse: mocks.recordDemoPracticeResponse,
}));
vi.mock("@/lib/student/learning-service", () => ({
  recordPersistedDiagnosticResponse: mocks.recordPersistedDiagnosticResponse,
  recordPersistedPracticeResponse: mocks.recordPersistedPracticeResponse,
}));

import { POST } from "@/app/api/responses/route";

function practiceRequest() {
  return new Request("http://localhost/api/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      studentId: "learner-1",
      itemId: "item-1",
      answer: "7/12",
      context: "practice",
      practiceSessionId: "session-1",
      practiceSessionItemId: "occurrence-1",
    }),
  });
}

describe("POST /api/responses storage dispatch", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.recordDemoPracticeResponse.mockReturnValue({ isCorrect: true, responseId: "demo-response" });
    mocks.recordPersistedPracticeResponse.mockResolvedValue({ isCorrect: true, responseId: "db-response" });
  });

  it("keeps a local demo actor out of Supabase even when persistence is available", async () => {
    mocks.requireStudentActor.mockResolvedValue({ studentId: "learner-1", mode: "demo", store: "local_demo" });

    const response = await POST(practiceRequest());

    expect(response.status).toBe(200);
    expect(mocks.recordDemoPracticeResponse).toHaveBeenCalledTimes(1);
    expect(mocks.recordPersistedPracticeResponse).not.toHaveBeenCalled();
  });

  it("uses the durable service for a persisted demo participant or production actor", async () => {
    mocks.requireStudentActor.mockResolvedValue({ studentId: "learner-1", mode: "demo", store: "persisted" });

    const response = await POST(practiceRequest());

    expect(response.status).toBe(200);
    expect(mocks.recordPersistedPracticeResponse).toHaveBeenCalledTimes(1);
    expect(mocks.recordDemoPracticeResponse).not.toHaveBeenCalled();
  });
});
