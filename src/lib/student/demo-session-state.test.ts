import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDemoSessionId,
  deleteDemoSession,
  getDemoSession,
  resetDemoSessionState,
  setDemoSession,
} from "@/lib/student/demo-session-state";

describe("demo session state", () => {
  beforeEach(() => {
    resetDemoSessionState();
  });

  afterEach(() => {
    resetDemoSessionState();
  });

  it("keeps diagnostic and practice runs in separate registries with unique IDs", () => {
    const diagnosticId = createDemoSessionId("diagnostic");
    const practiceId = createDemoSessionId("practice");
    const diagnosticRun = { studentId: "maya", answers: new Map<string, string>() };
    const practiceRun = { studentId: "maya", itemIds: ["common-denominator-1"] };

    setDemoSession("diagnostic", diagnosticId, diagnosticRun);
    setDemoSession("practice", practiceId, practiceRun);

    expect(diagnosticId).toBe("demo-diagnostic-1");
    expect(practiceId).toBe("demo-practice-2");
    expect(getDemoSession<typeof diagnosticRun>("diagnostic", diagnosticId)).toBe(diagnosticRun);
    expect(getDemoSession<typeof practiceRun>("practice", practiceId)).toBe(practiceRun);
    expect(getDemoSession("practice", diagnosticId)).toBeUndefined();
  });

  it("preserves a run and its sequence through a fresh module evaluation", async () => {
    const sessionId = createDemoSessionId("diagnostic");
    const run = { studentId: "maya", answers: ["4/8"] };
    setDemoSession("diagnostic", sessionId, run);

    vi.resetModules();
    const reloaded = await import("@/lib/student/demo-session-state");

    expect(reloaded.getDemoSession<typeof run>("diagnostic", sessionId)).toBe(run);
    expect(reloaded.createDemoSessionId("practice")).toBe("demo-practice-2");
    expect(reloaded.deleteDemoSession("diagnostic", sessionId)).toBe(true);
    expect(reloaded.getDemoSession("diagnostic", sessionId)).toBeUndefined();
  });
});
