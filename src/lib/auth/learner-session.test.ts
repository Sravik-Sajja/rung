import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDemoParticipant,
  DEMO_PARTICIPANT_COOKIE,
  resetDemoParticipantStore,
  resolveDemoParticipantSessionOnly,
} from "@/lib/demo/participant";
import { publicWalkthroughIds } from "@/lib/demo/contracts";
import { createTeacherWorkspace, resetTeacherWorkspaceStore } from "@/lib/teacher-workspace/session";
import {
  createTeacherWorkspaceStudentSession,
  joinTeacherWorkspaceAsParticipant,
  resetTeacherWorkspaceStudentSessionStore,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
} from "@/lib/teacher-workspace/student-session";
import {
  learnerSessionCookieClears,
  resolveLearnerSessions,
  revokeAllLearnerSessions,
} from "@/lib/auth/learner-session";

function requestWithCookies(cookies: Record<string, string>) {
  const header = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ");
  return new Request("http://localhost/api/example", { headers: header ? { cookie: header } : {} });
}

describe("learner session reconciliation", () => {
  beforeEach(() => {
    resetDemoParticipantStore();
    resetTeacherWorkspaceStore();
    resetTeacherWorkspaceStudentSessionStore();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  afterEach(() => {
    resetDemoParticipantStore();
    resetTeacherWorkspaceStore();
    resetTeacherWorkspaceStudentSessionStore();
    vi.unstubAllEnvs();
  });

  it("merges a participant and a joined session for the same student, with the joined class active and no assignment binding", async () => {
    const participant = await createDemoParticipant({ displayName: "Ari" });
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joined = await joinTeacherWorkspaceAsParticipant({
      joinCode: workspace.joinCode,
      participant: { studentId: participant.studentId, displayName: participant.displayName, gradeBand: participant.gradeBand },
    });

    const request = requestWithCookies({
      [DEMO_PARTICIPANT_COOKIE]: participant.sessionToken,
      [TEACHER_WORKSPACE_STUDENT_COOKIE]: joined.sessionToken,
    });

    const sessions = await resolveLearnerSessions(request);
    expect(sessions.sides.participant).toEqual({ state: "resolved" });
    expect(sessions.sides.joined).toEqual({ state: "resolved" });
    expect(sessions.resolution.kind).toBe("resolved");
    if (sessions.resolution.kind !== "resolved") throw new Error("unreachable");
    const { learner } = sessions.resolution;
    expect(learner.identity).toBe("temporary_participant");
    expect(learner.studentId).toBe(participant.studentId);
    expect(learner.classIds.sort()).toEqual([participant.classId, workspace.classId].sort());
    expect(learner.activeClassId).toBe(workspace.classId);
    expect(learner.boundAssignmentId).toBeNull();
    expect(learner.participant).not.toBeNull();
    expect(learner.joined).not.toBeNull();
  });

  it("resolves a joined-only student as persisted even when the session came from the local store", async () => {
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const student = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });
    expect(student.source).toBe("local");

    const request = requestWithCookies({ [TEACHER_WORKSPACE_STUDENT_COOKIE]: student.sessionToken });
    const sessions = await resolveLearnerSessions(request);
    expect(sessions.sides.participant).toEqual({ state: "missing_cookie" });
    expect(sessions.resolution.kind).toBe("resolved");
    if (sessions.resolution.kind !== "resolved") throw new Error("unreachable");
    const { learner } = sessions.resolution;
    expect(learner.identity).toBe("teacher_workspace_student");
    expect(learner.store).toBe("persisted");
    expect(learner.boundAssignmentId).toBe(workspace.assignmentId);
    expect(learner.classIds).toEqual([workspace.classId]);
    expect(learner.participant).toBeNull();
  });

  it("resolves a participant-only learner as local_demo, scoped to just the walkthrough class", async () => {
    const participant = await createDemoParticipant({ displayName: "Jordan" });
    const request = requestWithCookies({ [DEMO_PARTICIPANT_COOKIE]: participant.sessionToken });

    const sessions = await resolveLearnerSessions(request);
    expect(sessions.sides.joined).toEqual({ state: "missing_cookie" });
    expect(sessions.resolution.kind).toBe("resolved");
    if (sessions.resolution.kind !== "resolved") throw new Error("unreachable");
    const { learner } = sessions.resolution;
    expect(learner.identity).toBe("temporary_participant");
    expect(learner.store).toBe("local_demo");
    expect(learner.classIds).toEqual([publicWalkthroughIds.classId]);
    expect(learner.boundAssignmentId).toBeNull();
    expect(learner.joined).toBeNull();
  });

  it("prefers the participant when both cookies resolve to different students", async () => {
    const participant = await createDemoParticipant({ displayName: "Ari" });
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const otherStudent = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });
    expect(otherStudent.studentId).not.toBe(participant.studentId);

    const request = requestWithCookies({
      [DEMO_PARTICIPANT_COOKIE]: participant.sessionToken,
      [TEACHER_WORKSPACE_STUDENT_COOKIE]: otherStudent.sessionToken,
    });

    const sessions = await resolveLearnerSessions(request);
    // The raw joined side did resolve; only the reconciled learner drops it.
    expect(sessions.sides.joined).toEqual({ state: "resolved" });
    expect(sessions.resolution.kind).toBe("resolved");
    if (sessions.resolution.kind !== "resolved") throw new Error("unreachable");
    expect(sessions.resolution.learner.studentId).toBe(participant.studentId);
    expect(sessions.resolution.learner.joined).toBeNull();
  });

  it("resolves the joined learner when the participant cookie has expired, instead of reporting nobody signed in", async () => {
    const longExpired = await createDemoParticipant({ displayName: "Ari", now: new Date(0) });
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joined = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });

    const request = requestWithCookies({
      [DEMO_PARTICIPANT_COOKIE]: longExpired.sessionToken,
      [TEACHER_WORKSPACE_STUDENT_COOKIE]: joined.sessionToken,
    });

    expect((await resolveDemoParticipantSessionOnly(request)).kind).toBe("expired");

    const sessions = await resolveLearnerSessions(request);
    expect(sessions.sides.participant).toEqual({ state: "expired" });
    expect(sessions.resolution.kind).toBe("resolved");
    if (sessions.resolution.kind !== "resolved") throw new Error("unreachable");
    expect(sessions.resolution.learner.identity).toBe("teacher_workspace_student");
    expect(sessions.resolution.learner.studentId).toBe(joined.studentId);
  });

  it("reports no learner when neither cookie is present", async () => {
    const request = requestWithCookies({});
    const sessions = await resolveLearnerSessions(request);
    expect(sessions.sides.participant).toEqual({ state: "missing_cookie" });
    expect(sessions.sides.joined).toEqual({ state: "missing_cookie" });
    expect(sessions.resolution).toEqual({ kind: "none" });
  });

  it("revokes both sessions so neither resolves afterwards", async () => {
    const participant = await createDemoParticipant({ displayName: "Ari" });
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joined = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });

    const request = requestWithCookies({
      [DEMO_PARTICIPANT_COOKIE]: participant.sessionToken,
      [TEACHER_WORKSPACE_STUDENT_COOKIE]: joined.sessionToken,
    });

    await revokeAllLearnerSessions(request);

    const sessions = await resolveLearnerSessions(request);
    expect(sessions.resolution.kind).not.toBe("resolved");
    expect(sessions.sides.participant).toEqual({ state: "invalid" });
    expect(sessions.sides.joined).toEqual({ state: "invalid" });
  });

  it("clears both learner cookie names", () => {
    const clears = learnerSessionCookieClears();
    expect(clears.map((cookie) => cookie.name).sort()).toEqual([DEMO_PARTICIPANT_COOKIE, TEACHER_WORKSPACE_STUDENT_COOKIE].sort());
    for (const cookie of clears) {
      expect(cookie).toMatchObject({ value: "", httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    }
  });
});
