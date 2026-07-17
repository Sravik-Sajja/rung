import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/teacher-workspace/join-preview/route";
import { createDemoParticipant, DEMO_PARTICIPANT_COOKIE, resetDemoParticipantStore } from "@/lib/demo/participant";
import { createTeacherWorkspace, resetTeacherWorkspaceStore } from "@/lib/teacher-workspace/session";
import {
  createTeacherWorkspaceStudentSession,
  resetTeacherWorkspaceStudentSessionStore,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
} from "@/lib/teacher-workspace/student-session";

function previewUrl(joinCode: string) {
  return `http://localhost/api/teacher-workspace/join-preview?joinCode=${encodeURIComponent(joinCode)}`;
}

describe("/api/teacher-workspace/join-preview", () => {
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

  it("reports a walkthrough participant as signed in", async () => {
    const participant = await createDemoParticipant({ displayName: "Ari" });
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });

    const response = await GET(new Request(previewUrl(workspace.joinCode), {
      headers: { cookie: `${DEMO_PARTICIPANT_COOKIE}=${participant.sessionToken}` },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ signedInAs: { displayName: "Ari" } });
  });

  it("reports a joined-only learner as signed in, so the confirm screen skips the name field", async () => {
    // signedInAs reports any resolved learner: the confirm screen omits
    // displayName from its POST whenever signedInAs is set, and the durable
    // student-session route now re-enrolls any resolved learner — a joined-only
    // one included (its RPC accepts a live joined-student session; see
    // migration 021). So the joined-only learner carries their name and student
    // from the resolved cookie, and the confirm screen is right to skip asking.
    const firstWorkspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joined = await createTeacherWorkspaceStudentSession({ joinCode: firstWorkspace.joinCode, displayName: "Kai" });
    const secondWorkspace = await createTeacherWorkspace({ teacherDisplayName: "Mr. Lee", className: "Period 5 fractions" });

    const response = await GET(new Request(previewUrl(secondWorkspace.joinCode), {
      headers: { cookie: `${TEACHER_WORKSPACE_STUDENT_COOKIE}=${joined.sessionToken}` },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ signedInAs: { displayName: "Kai" } });
  });

  it("reports nobody signed in when neither learner cookie is present", async () => {
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const response = await GET(new Request(previewUrl(workspace.joinCode)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ signedInAs: null });
  });
});
