import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireStudentActor } from "@/lib/auth/actor";
import { createTeacherWorkspace, resetTeacherWorkspaceStore } from "@/lib/teacher-workspace/session";
import {
  createTeacherWorkspaceStudentSession,
  parseTeacherWorkspaceStudentCookie,
  requireTeacherWorkspaceStudentAssignment,
  resetTeacherWorkspaceStudentSessionStore,
  resolveTeacherWorkspaceStudentSession,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
} from "@/lib/teacher-workspace/student-session";

describe("teacher workspace student sessions", () => {
  beforeEach(() => {
    resetTeacherWorkspaceStore(); resetTeacherWorkspaceStudentSessionStore();
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });
  afterEach(() => { resetTeacherWorkspaceStore(); resetTeacherWorkspaceStudentSessionStore(); vi.unstubAllEnvs(); });

  it("joins only through a workspace's server-held code and binds class and assignment", async () => {
    const workspace = await createTeacherWorkspace({ teacherDisplayName: "Ms. Jordan", className: "Period 3 fractions" });
    const student = await createTeacherWorkspaceStudentSession({ joinCode: workspace.joinCode, displayName: "Kai" });
    expect(student.classId).toBe(workspace.classId);
    expect(student.assignmentId).toBe(workspace.assignmentId);
    expect(workspace.students.some((candidate) => candidate.id === student.studentId)).toBe(true);
    expect(workspace.cells.filter((cell) => cell.studentId === student.studentId)).toHaveLength(workspace.subskills.length);

    const request = new Request("http://localhost/student", { headers: { cookie: `${TEACHER_WORKSPACE_STUDENT_COOKIE}=${student.sessionToken}` } });
    await expect(resolveTeacherWorkspaceStudentSession(request)).resolves.toEqual({ kind: "resolved", student: expect.objectContaining({ studentId: student.studentId, classId: workspace.classId, assignmentId: workspace.assignmentId }) });
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
});
