import { NextResponse } from "next/server";
import {
  isTeacherWorkspaceDemoMode,
  removeTeacherWorkspaceStudent,
  resolveTeacherWorkspaceSession,
} from "@/lib/teacher-workspace/session";

export const dynamic = "force-dynamic";

/**
 * Removes a student from the caller's own workspace. The class comes from the
 * owner cookie this server resolved, so the URL can only ever name which
 * student to remove, never which class to remove them from.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  if (!isTeacherWorkspaceDemoMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { studentId } = await params;
  try {
    const session = await resolveTeacherWorkspaceSession(request);
    if (session.kind !== "resolved") {
      return NextResponse.json({ error: "Open a teacher workspace before changing its roster." }, { status: 401 });
    }
    if (!session.workspace.students.some((student) => student.id === studentId)) {
      return NextResponse.json({ error: "That student is not in this class." }, { status: 404 });
    }
    await removeTeacherWorkspaceStudent({ classId: session.workspace.classId, studentId });
    const response = NextResponse.json({ removed: studentId });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove that student." }, { status: 400 });
  }
}
