import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { createDemoParticipant, resetDemoParticipantStore } from "@/lib/demo/participant";
import { completeDemoDiagnostic, recordDemoDiagnosticResponse, resetDemoLearningStore, startDemoDiagnostic } from "@/lib/student/demo-learning-store";
import { getTeacherDashboard, getTeacherStudentEvidence } from "@/lib/teacher/repository";

describe("teacher response evidence projection", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    resetDemoParticipantStore();
    resetDemoLearningStore();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  afterEach(() => {
    resetDemoParticipantStore();
    resetDemoLearningStore();
    vi.unstubAllEnvs();
  });

  it("projects local diagnostic answers under their subskills without leaking scoring data", async () => {
    const participant = await createDemoParticipant({ displayName: "Casey" });
    const diagnostic = startDemoDiagnostic(participant.studentId);
    for (const item of diagnostic.items) {
      recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId: participant.studentId,
        itemId: item.id,
        answer: "0",
      });
    }
    completeDemoDiagnostic({ diagnosticSessionId: diagnostic.diagnosticSessionId, studentId: participant.studentId });

    const evidence = await getTeacherStudentEvidence(participant.studentId);
    expect(Object.values(evidence.attemptsBySubskill).flat()).toHaveLength(5);
    const first = Object.values(evidence.attemptsBySubskill).flat()[0]!;
    expect(first).toMatchObject({ context: "diagnostic", answerRaw: "0", isCorrect: false });
    expect(first).not.toHaveProperty("answerSpec");
    expect(first).not.toHaveProperty("distractorMap");
    expect(first).not.toHaveProperty("diagnosis");

    const dashboard = await getTeacherDashboard();
    expect(Object.values(dashboard!.responseEvidenceByStudent![participant.studentId]).flat()).toHaveLength(5);
  });

  it("reads only the requested durable student's presentation-safe response fields", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const finalOrder = vi.fn().mockResolvedValue({
      data: [{
        id: "response-b",
        item_id: "item-b",
        answer_raw: " 7/12 ",
        is_correct: true,
        context: "practice",
        submitted_at: "2026-07-16T12:00:00.000Z",
        items: { subskill_id: "add-unlike-denominators", prompt: "What is 1/3 + 1/4?", visual_spec: null },
      }],
      error: null,
    });
    const firstOrder = vi.fn(() => ({ order: finalOrder }));
    const inContext = vi.fn(() => ({ order: firstOrder }));
    const byStudent = vi.fn(() => ({ in: inContext }));
    const select = vi.fn(() => ({ eq: byStudent }));
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    await expect(getTeacherStudentEvidence("student-a")).resolves.toEqual({
      studentId: "student-a",
      attemptsBySubskill: {
        "add-unlike-denominators": [{
          id: "response-b", itemId: "item-b", prompt: "What is 1/3 + 1/4?",
          answerRaw: " 7/12 ", isCorrect: true, context: "practice", submittedAt: "2026-07-16T12:00:00.000Z",
        }],
      },
    });
    expect(byStudent).toHaveBeenCalledWith("student_id", "student-a");
    const selectedFields = (select.mock.calls as unknown as Array<[string]>)[0]?.[0] ?? "";
    expect(selectedFields).not.toContain("answer_spec");
    expect(selectedFields).not.toContain("distractor_map");
  });
});
