import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { TeacherWorkspaceDashboard } from "@/components/teacher-workspace/workspace-dashboard";
import { TeacherWorkspaceSetupForm } from "@/components/teacher-workspace/setup-form";
import { isTeacherWorkspaceDemoMode, resolveTeacherWorkspaceSession, TEACHER_WORKSPACE_COOKIE } from "@/lib/teacher-workspace/session";
import { getTeacherAssignedFollowUps, getTeacherEvidenceByStudentIds } from "@/lib/teacher/repository";

export const dynamic = "force-dynamic";

export default async function TeacherWorkspacePage() {
  if (!isTeacherWorkspaceDemoMode()) return <AppShell active="teacher"><p className="text-ink-muted">This non-production teacher workspace is unavailable.</p></AppShell>;
  const token = (await cookies()).get(TEACHER_WORKSPACE_COOKIE)?.value;
  const result = await resolveTeacherWorkspaceSession(new Request("http://local/teacher-workspace", { headers: token ? { cookie: `${TEACHER_WORKSPACE_COOKIE}=${encodeURIComponent(token)}` } : {} }));
  if (result.kind !== "resolved") return <AppShell active="teacher" width="wide"><TeacherWorkspaceSetupForm /></AppShell>;
  // Scoped to this workspace's own roster, so it cannot surface an answer from
  // a learner in another class.
  const studentIds = result.workspace.students.map((student) => student.id);
  const [responseEvidenceByStudent, assignedFollowUps] = await Promise.all([
    getTeacherEvidenceByStudentIds(studentIds, result.workspace.classId),
    getTeacherAssignedFollowUps(studentIds),
  ]);
  return (
    <AppShell active="teacher" width="wide">
      <TeacherWorkspaceDashboard assignedFollowUps={assignedFollowUps} responseEvidenceByStudent={responseEvidenceByStudent} workspace={result.workspace} />
    </AppShell>
  );
}
