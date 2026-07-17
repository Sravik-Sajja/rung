import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireActorClass, requireStudentActor } from "@/lib/auth/actor";
import { createTeacherWorkspace, resetTeacherWorkspaceStore } from "@/lib/teacher-workspace/session";
import { createDemoParticipant, DEMO_PARTICIPANT_COOKIE, resetDemoParticipantStore } from "@/lib/demo/participant";
import {
  createTeacherWorkspaceStudentSession,
  joinTeacherWorkspaceAsParticipant,
  parseTeacherWorkspaceStudentCookie,
  requireTeacherWorkspaceStudentAssignment,
  resetTeacherWorkspaceStudentSessionStore,
  resolveTeacherWorkspaceStudentSessionOnly,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
} from "@/lib/teacher-workspace/student-session";

describe("teacher workspace student sessions", () => {
  beforeEach(() => {
    resetTeacherWorkspaceStore(); resetTeacherWorkspaceStudentSessionStore(); resetDemoParticipantStore();
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });
  afterEach(() => { resetTeacherWorkspaceStore(); resetTeacherWorkspaceStudentSessionStore(); resetDemoParticipantStore(); vi.unstubAllEnvs(); });

  it("joins only through a workspace's server-held code and binds class and assignment", async () => {
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const student = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });
    expect(student.classId).toBe(workspace.classId);
    expect(student.assignmentId).toBe(workspace.assignmentId);
    expect(workspace.students.some((candidate) => candidate.id === student.studentId)).toBe(true);
    expect(workspace.cells.filter((cell) => cell.studentId === student.studentId)).toHaveLength(workspace.subskills.length);

    const request = new Request("http://localhost/student", { headers: { cookie: `${TEACHER_WORKSPACE_STUDENT_COOKIE}=${student.sessionToken}` } });
    await expect(resolveTeacherWorkspaceStudentSessionOnly(request)).resolves.toEqual({ kind: "resolved", student: expect.objectContaining({ studentId: student.studentId, classId: workspace.classId, assignmentId: workspace.assignmentId }) });
    await expect(requireTeacherWorkspaceStudentAssignment(request, student.studentId, workspace.assignmentId)).resolves.toEqual(expect.objectContaining({ studentId: student.studentId }));
    await expect(requireTeacherWorkspaceStudentAssignment(request, student.studentId, "fractions-diagnostic-v1")).rejects.toThrow("cannot access that assignment");
  });

  it("does not confuse public demo or teacher-owner cookies with the joined-student cookie", async () => {
    expect(parseTeacherWorkspaceStudentCookie("rung_demo_participant=public; rung_teacher_workspace=owner")).toBeNull();
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const student = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });
    const request = new Request("http://localhost/student", { headers: { cookie: `${TEACHER_WORKSPACE_STUDENT_COOKIE}=${student.sessionToken}` } });
    await expect(requireStudentActor(request, student.studentId)).resolves.toEqual(expect.objectContaining({
      studentId: student.studentId, assignmentId: workspace.assignmentId, store: "persisted", identity: "teacher_workspace_student",
    }));
    await expect(requireStudentActor(request, "someone-else")).rejects.toThrow("belongs to another learner");
  });

  it("merges a walkthrough participant cookie and a joined-class cookie for the same student into one unbound, multi-class actor", async () => {
    const participant = await createDemoParticipant({ displayName: "Ari" });
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const joined = await joinTeacherWorkspaceAsParticipant({
      joinCode: workspace.joinCode,
      participant: { studentId: participant.studentId, displayName: participant.displayName, gradeBand: participant.gradeBand },
    });

    const request = new Request("http://localhost/student", {
      headers: { cookie: `${DEMO_PARTICIPANT_COOKIE}=${participant.sessionToken}; ${TEACHER_WORKSPACE_STUDENT_COOKIE}=${joined.sessionToken}` },
    });

    const actor = await requireStudentActor(request, participant.studentId);
    expect(actor.classId).toBe(workspace.classId);
    expect(actor.classIds.sort()).toEqual([participant.classId, workspace.classId].sort());
    expect(actor.assignmentId).toBeUndefined();

    expect(requireActorClass(actor, workspace.classId)).toBe(workspace.classId);
    expect(() => requireActorClass(actor, "some-other-class")).toThrow("cannot access that class");
  });
});
