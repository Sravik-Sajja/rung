import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/teacher-workspace/student-session/route";
import { createDemoParticipant, DEMO_PARTICIPANT_COOKIE, resetDemoParticipantStore } from "@/lib/demo/participant";
import {
  createTeacherWorkspace,
  resetTeacherWorkspaceStore,
} from "@/lib/teacher-workspace/session";
import {
  resetTeacherWorkspaceStudentSessionStore,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
} from "@/lib/teacher-workspace/student-session";

describe("/api/teacher-workspace/student-session", () => {
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

  it("joins an existing walkthrough participant into a class under their own student, not a new one", async () => {
    const participant = await createDemoParticipant({ displayName: "Ari" });
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const participantCookie = `${DEMO_PARTICIPANT_COOKIE}=${participant.sessionToken}`;

    const response = await POST(new Request("http://localhost/api/teacher-workspace/student-session", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: participantCookie },
      body: JSON.stringify({ joinCode: workspace.joinCode }),
    }));

    expect(response.status).toBe(201);
    const body = await response.json() as { student: { studentId: string }; joinedExisting: boolean };
    expect(body.joinedExisting).toBe(true);
    // Same student, not a second one: the walkthrough learner's id is reused.
    expect(body.student.studentId).toBe(participant.studentId);
    expect(body.student.studentId).toMatch(/^demo-learner-/);
  });

  it("keeps a joined-only learner's student when they join a second class with a joinCode-only body", async () => {
    const firstWorkspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joinedPost = await POST(new Request("http://localhost/api/teacher-workspace/student-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ joinCode: firstWorkspace.joinCode, displayName: "Kai" }),
    }));
    const joinedCookie = joinedPost.headers.get("set-cookie")!.split(";")[0]!;
    const joinedBody = await joinedPost.json() as { student: { studentId: string; classId: string } };

    const secondWorkspace = await createTeacherWorkspace({ teacherDisplayName: "Mr. Lee", className: "Period 5 fractions" });

    // This learner only ever held a joined-class cookie (never did the
    // walkthrough). A joinCode-only body (no displayName) is what the
    // keep-identity path takes: the server resolves their student from the
    // cookie, so they carry the same id into the second class rather than
    // minting a new one.
    const second = await POST(new Request("http://localhost/api/teacher-workspace/student-session", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: joinedCookie },
      body: JSON.stringify({ joinCode: secondWorkspace.joinCode }),
    }));
    expect(second.status).toBe(201);
    const secondBody = await second.json() as { student: { studentId: string; classId: string }; joinedExisting?: boolean };
    expect(secondBody.joinedExisting).toBe(true);
    // Same student as the first class...
    expect(secondBody.student.studentId).toBe(joinedBody.student.studentId);
    // ...now active in the second class.
    expect(secondBody.student.classId).toBe(secondWorkspace.classId);
    expect(secondBody.student.classId).not.toBe(joinedBody.student.classId);
  });

  it("clears both learner cookies on DELETE, and neither session resolves afterwards", async () => {
    const participant = await createDemoParticipant({ displayName: "Ari" });
    const participantCookie = `${DEMO_PARTICIPANT_COOKIE}=${participant.sessionToken}`;

    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joinResponse = await POST(new Request("http://localhost/api/teacher-workspace/student-session", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: participantCookie },
      body: JSON.stringify({ joinCode: workspace.joinCode }),
    }));
    const joinedCookie = joinResponse.headers.get("set-cookie")!.split(";")[0]!;

    const combinedCookie = `${participantCookie}; ${joinedCookie}`;
    const signedOut = await DELETE(new Request("http://localhost/api/teacher-workspace/student-session", { headers: { cookie: combinedCookie } }));
    expect(signedOut.status).toBe(200);
    const clearedCookies = signedOut.headers.getSetCookie();
    expect(clearedCookies.some((cookie) => cookie.startsWith(`${DEMO_PARTICIPANT_COOKIE}=`) && cookie.includes("Max-Age=0"))).toBe(true);
    expect(clearedCookies.some((cookie) => cookie.startsWith(`${TEACHER_WORKSPACE_STUDENT_COOKIE}=`) && cookie.includes("Max-Age=0"))).toBe(true);

    const resumed = await GET(new Request("http://localhost/api/teacher-workspace/student-session", { headers: { cookie: combinedCookie } }));
    expect(resumed.status).toBe(401);
  });
});
