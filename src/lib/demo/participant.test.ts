import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { requireStudentActor } from "@/lib/auth/actor";
import {
  createDemoParticipant,
  DEMO_PARTICIPANT_COOKIE,
  isDemoMode,
  resetDemoParticipantStore,
  resolveDemoParticipantSession,
} from "@/lib/demo/participant";
import {
  applyGeneratedDemoPracticePlan,
  completeDemoDiagnostic,
  getDemoPractice,
  recordDemoDiagnosticResponse,
  recordDemoPracticeResponse,
  resetDemoLearningStore,
  startDemoDiagnostic,
} from "@/lib/student/demo-learning-store";
import { getTeacherDashboard } from "@/lib/teacher/repository";

function requestWithParticipantCookie(token: string) {
  return new Request("http://localhost/api/example", {
    headers: { cookie: `${DEMO_PARTICIPANT_COOKIE}=${token}` },
  });
}

describe("temporary demo participants", () => {
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

  it("is always disabled in production, even if DEMO_MODE is misconfigured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    expect(isDemoMode()).toBe(false);
  });

  it("binds a server-created learner to an opaque cookie and rejects impersonation", async () => {
    const participant = await createDemoParticipant({ displayName: "  Ari O'Neil  " });
    expect(participant.studentId).toMatch(/^demo-learner-/);
    expect(participant.displayName).toBe("Ari O'Neil");
    expect(participant.source).toBe("local");

    const request = requestWithParticipantCookie(participant.sessionToken);
    await expect(resolveDemoParticipantSession(request)).resolves.toEqual({
      kind: "resolved",
      participant: expect.objectContaining({
        studentId: participant.studentId,
        displayName: "Ari O'Neil",
      }),
    });
    await expect(requireStudentActor(request, participant.studentId)).resolves.toEqual(expect.objectContaining({
      studentId: participant.studentId,
      identity: "temporary_participant",
      store: "local_demo",
    }));
    await expect(requireStudentActor(request, "riley-johnson")).rejects.toThrow("belongs to another learner");

    // A missing cookie never opens a seeded roster record.
    await expect(requireStudentActor(new Request("http://localhost/api/example"), "riley-johnson"))
      .rejects.toThrow("Start your climb");
    await expect(requireStudentActor(new Request("http://localhost/api/example"), "someone-else"))
      .rejects.toThrow("Start your climb");
  });

  it("projects local participant rows and evolving local mastery through the teacher repository", async () => {
    const participant = await createDemoParticipant({ displayName: "Jordan" });
    const before = await getTeacherDashboard();
    expect(before?.students).toContainEqual(expect.objectContaining({ id: participant.studentId, displayName: "Jordan" }));
    expect(before?.cells.filter((cell) => cell.studentId === participant.studentId)).toHaveLength(5);
    expect(before?.cells.find((cell) => cell.studentId === participant.studentId && cell.subskillId === "add-unlike-denominators"))
      .toEqual(expect.objectContaining({ level: "not_started" }));

    const diagnostic = startDemoDiagnostic(participant.studentId);
    for (const item of diagnostic.items) {
      expect(recordDemoDiagnosticResponse({
        diagnosticSessionId: diagnostic.diagnosticSessionId,
        studentId: participant.studentId,
        itemId: item.id,
        answer: "0",
      })).not.toBeNull();
    }
    const completion = completeDemoDiagnostic({
      diagnosticSessionId: diagnostic.diagnosticSessionId,
      studentId: participant.studentId,
    });
    expect(completion).not.toBeNull();

    const practiceSessionId = completion!.practiceSession.id;
    const applied = applyGeneratedDemoPracticePlan({
      practiceSessionId,
      studentId: participant.studentId,
      targetSubskillId: "add-unlike-denominators",
      items: [
        { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 },
        { kind: "fraction_operation", operation: "add", leftNumerator: 2, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
        { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 6, rightNumerator: 1, rightDenominator: 4 },
      ],
    });
    expect(applied).not.toBeNull();
    const first = getDemoPractice(practiceSessionId, participant.studentId)?.items[0];
    expect(first).toBeDefined();
    recordDemoPracticeResponse({
      practiceSessionId,
      practiceSessionItemId: first!.practiceSessionItemId,
      studentId: participant.studentId,
      answer: "7/12",
    });

    const after = await getTeacherDashboard();
    expect(after?.cells.find((cell) => cell.studentId === participant.studentId && cell.subskillId === "add-unlike-denominators"))
      .toEqual(expect.objectContaining({ level: "developing", evidenceSummary: "Updated from your focused practice." }));
  });

  it("does not replace configured database failures with local demo data", async () => {
    const participant = await createDemoParticipant({ displayName: "Database check" });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } }),
        })),
      })),
    });

    await expect(getTeacherDashboard()).rejects.toThrow("Could not load teacher dashboard: database unavailable");
    expect(mocks.createClient).toHaveBeenCalled();
    // The locally-created learner proves this is not merely an empty-store
    // failure: the repository must still surface the database error instead
    // of presenting their local row as a successful durable dashboard.
    expect(participant.source).toBe("local");
  });
});
