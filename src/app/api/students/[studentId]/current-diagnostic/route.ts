import { NextResponse } from "next/server";
import { requireStudentActor } from "@/lib/auth/actor";
import { getDemoCurrentDiagnostic } from "@/lib/student/demo-learning-store";
import { getPersistedCurrentDiagnostic } from "@/lib/student/learning-service";

/**
 * Powers re-entry to the plan hub (WS1c): the latest completed diagnostic session id and its
 * practice plans, so a student who navigates away can find their way back without redoing the
 * check-in. `diagnosticSessionId: null` means this student has not completed one yet — that is a
 * normal state, not an error.
 */
export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  try {
    const actor = await requireStudentActor(request, studentId);
    const current = actor.store === "local_demo"
      ? getDemoCurrentDiagnostic(studentId)
      : await getPersistedCurrentDiagnostic({ studentId, assignmentId: actor.assignmentId });
    if (!current) return NextResponse.json({ error: "Diagnostic persistence is unavailable" }, { status: 503 });
    return NextResponse.json({
      studentId,
      diagnosticSessionId: current.diagnosticSessionId,
      assignmentId: "assignmentId" in current ? current.assignmentId : actor.assignmentId ?? null,
      practicePlans: current.practicePlans,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your current diagnostic" }, { status: 400 });
  }
}
