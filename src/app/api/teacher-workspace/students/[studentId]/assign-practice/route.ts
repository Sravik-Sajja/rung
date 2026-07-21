import { NextResponse } from "next/server";
import { z } from "zod";
import { assignDemoTeacherPractice } from "@/lib/student/demo-learning-store";
import { assignTeacherPractice } from "@/lib/student/learning-service";
import {
  isTeacherWorkspaceDemoMode,
  resolveTeacherWorkspaceSession,
} from "@/lib/teacher-workspace/session";

export const dynamic = "force-dynamic";

const assignPracticeSchema = z.object({
  subskillId: z.string().trim().min(1, "Choose a skill to assign."),
});

/**
 * Creates a real practice plan for one of the caller's own workspace students —
 * the fix for `assignFollowUp` in dashboard-view.tsx, which only ever flipped a
 * client-side notice. Auth mirrors the sibling DELETE roster route exactly: an
 * owner cookie resolves the workspace, and the target student must already be
 * on its roster, so the request body can only ever name which skill to assign,
 * never which student or class.
 */
export async function POST(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  if (!isTeacherWorkspaceDemoMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { studentId } = await params;
  try {
    const body = await request.json().catch(() => null);
    const parsed = assignPracticeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose a skill to assign." }, { status: 400 });
    }

    const session = await resolveTeacherWorkspaceSession(request);
    if (session.kind !== "resolved") {
      return NextResponse.json({ error: "Open a teacher workspace before assigning practice." }, { status: 401 });
    }
    if (!session.workspace.students.some((student) => student.id === studentId)) {
      return NextResponse.json({ error: "That student is not in this class." }, { status: 404 });
    }
    if (!session.workspace.subskills.some((subskill) => subskill.id === parsed.data.subskillId)) {
      return NextResponse.json({ error: "That skill is not part of this class." }, { status: 404 });
    }

    // `workspace.source` is the same signal session.ts itself branches on
    // (local in-memory Maps vs. Supabase RPCs), and it agrees with the joined
    // student's own actor.store here because a workspace is only ever
    // "supabase" when Supabase is configured for the whole app.
    const result = session.workspace.source === "supabase"
      ? await assignTeacherPractice({
          studentId,
          classId: session.workspace.classId,
          subskillId: parsed.data.subskillId,
          teacherName: session.workspace.teacherDisplayName,
        })
      : assignDemoTeacherPractice({
          studentId,
          classId: session.workspace.classId,
          subskillId: parsed.data.subskillId,
          teacherName: session.workspace.teacherDisplayName,
        });
    if (!result) return NextResponse.json({ error: "Could not assign practice for that student." }, { status: 503 });

    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not assign practice." }, { status: 400 });
  }
}
