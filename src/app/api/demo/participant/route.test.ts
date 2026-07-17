import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/demo/participant/route";
import { DEMO_PARTICIPANT_COOKIE, resetDemoParticipantStore } from "@/lib/demo/participant";
import { recordDemoDiagnosticResponse, resetDemoLearningStore, startDemoDiagnostic } from "@/lib/student/demo-learning-store";
import { buildDiagnosticItems } from "@/lib/items/diagnostic-items";
import { createTeacherWorkspace, resetTeacherWorkspaceStore } from "@/lib/teacher-workspace/session";
import {
  createTeacherWorkspaceStudentSession,
  resetTeacherWorkspaceStudentSessionStore,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
} from "@/lib/teacher-workspace/student-session";

describe("/api/demo/participant", () => {
  beforeEach(() => {
    resetDemoParticipantStore();
    resetDemoLearningStore();
    resetTeacherWorkspaceStore();
    resetTeacherWorkspaceStudentSessionStore();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  afterEach(() => {
    resetDemoParticipantStore();
    resetDemoLearningStore();
    resetTeacherWorkspaceStore();
    resetTeacherWorkspaceStudentSessionStore();
    vi.unstubAllEnvs();
  });

  it("creates a temporary learner without exposing its session token in JSON", async () => {
    const response = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Kai" }),
    }));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { participant: { studentId: string; displayName: string; sessionToken?: string } };
    expect(body.participant.studentId).toMatch(/^demo-learner-/);
    expect(body.participant.displayName).toBe("Kai");
    expect(body.participant.sessionToken).toBeUndefined();

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("rung_demo_participant=");
    expect(setCookie).toContain("HttpOnly");
    const cookie = setCookie!.split(";")[0];
    const resumed = await GET(new Request("http://localhost/api/demo/participant", { headers: { cookie } }));
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toEqual({
      participant: expect.objectContaining({ studentId: body.participant.studentId, displayName: "Kai" }),
      resume: { kind: "start", nextPath: `/student/diagnostic?studentId=${body.participant.studentId}&assignmentId=fractions-diagnostic-v1` },
    });
  });

  it("returns a cookie-owned partial diagnostic as the next resume step", async () => {
    const created = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Kai" }),
    }));
    const body = await created.json() as { participant: { studentId: string } };
    const cookie = created.headers.get("set-cookie")!.split(";")[0]!;
    const diagnostic = startDemoDiagnostic(body.participant.studentId);
    const item = buildDiagnosticItems(body.participant.studentId)[0]!;
    recordDemoDiagnosticResponse({
      diagnosticSessionId: diagnostic.diagnosticSessionId,
      studentId: body.participant.studentId,
      itemId: item.id,
      answer: item.answerSpec.accepted[0],
    });

    const resumed = await GET(new Request("http://localhost/api/demo/participant", { headers: { cookie } }));
    await expect(resumed.json()).resolves.toMatchObject({
      resume: {
        kind: "diagnostic",
        nextPath: `/student/diagnostic?studentId=${body.participant.studentId}&assignmentId=fractions-diagnostic-v1&resume=1`,
      },
    });
  });

  it("signs out the cookie-bound learner so it cannot resume", async () => {
    const created = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Sam" }),
    }));
    const cookie = created.headers.get("set-cookie")!.split(";")[0]!;

    const signedOut = await DELETE(new Request("http://localhost/api/demo/participant", { headers: { cookie } }));
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");

    const resumed = await GET(new Request("http://localhost/api/demo/participant", { headers: { cookie } }));
    expect(resumed.status).toBe(401);
  });

  it("clears both learner cookies on sign-out, and neither session resolves afterwards", async () => {
    const created = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Ari" }),
    }));
    const participantCookie = created.headers.get("set-cookie")!.split(";")[0]!;
    const participantBody = await created.json() as { participant: { studentId: string; displayName: string; gradeBand: string } };

    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joined = await createTeacherWorkspaceStudentSession({
      joinCode: workspace.joinCode,
      displayName: participantBody.participant.displayName,
    });
    const joinedCookie = `${TEACHER_WORKSPACE_STUDENT_COOKIE}=${joined.sessionToken}`;

    const combinedCookie = `${participantCookie}; ${joinedCookie}`;
    const signedOut = await DELETE(new Request("http://localhost/api/demo/participant", { headers: { cookie: combinedCookie } }));
    expect(signedOut.status).toBe(200);
    const clearedCookies = signedOut.headers.getSetCookie();
    expect(clearedCookies.some((cookie) => cookie.startsWith(`${DEMO_PARTICIPANT_COOKIE}=`) && cookie.includes("Max-Age=0"))).toBe(true);
    expect(clearedCookies.some((cookie) => cookie.startsWith(`${TEACHER_WORKSPACE_STUDENT_COOKIE}=`) && cookie.includes("Max-Age=0"))).toBe(true);

    // Both cookies now name revoked, invalid sessions rather than missing ones,
    // so this reports 401 (a stale session), not 404 (nobody signed in).
    const resumed = await GET(new Request("http://localhost/api/demo/participant", { headers: { cookie: combinedCookie } }));
    expect(resumed.status).toBe(401);
  });

  it("resolves a joined-only learner through the participant JSON field, resuming into their joined assignment", async () => {
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const student = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });
    const cookie = `${TEACHER_WORKSPACE_STUDENT_COOKIE}=${student.sessionToken}`;

    const resumed = await GET(new Request("http://localhost/api/demo/participant", { headers: { cookie } }));
    expect(resumed.status).toBe(200);
    const body = await resumed.json() as { participant: { studentId: string }; resume: { kind: string; nextPath: string } };
    expect(body.participant.studentId).toBe(student.studentId);
    expect(body.resume.nextPath).toContain(workspace.assignmentId);
    expect(body.resume.nextPath).not.toContain("fractions-diagnostic-v1");
  });

  it("rejects malformed names and production demo creation", async () => {
    const malformed = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "<script>" }),
    }));
    expect(malformed.status).toBe(400);

    vi.stubEnv("NODE_ENV", "production");
    const production = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Kai" }),
    }));
    expect(production.status).toBe(404);
  });
});
