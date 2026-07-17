import { NextResponse } from "next/server";
import { requireStudentActor } from "@/lib/auth/actor";
import { startDemoDiagnostic } from "@/lib/student/demo-learning-store";
import { startPersistedDiagnostic } from "@/lib/student/learning-service";

export async function GET(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const studentId = new URL(request.url).searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "Start your climb before opening a diagnostic." }, { status: 400 });
  try {
    const actor = await requireStudentActor(request, studentId);
    // Only an assignment-bound session is restricted to one diagnostic. A
    // walkthrough participant carries no assignment and is not limited here.
    if (actor.assignmentId && actor.assignmentId !== assignmentId) {
      return NextResponse.json({ error: "This joined student session cannot access that diagnostic." }, { status: 403 });
    }
    const diagnostic = actor.store === "local_demo"
      ? startDemoDiagnostic(studentId)
      : await startPersistedDiagnostic({ studentId, assignmentId });
    if (!diagnostic) return NextResponse.json({ error: "Diagnostic persistence is unavailable" }, { status: 503 });
    if (diagnostic.assignmentId !== assignmentId) return NextResponse.json({ error: "Unknown diagnostic assignment" }, { status: 404 });
    return NextResponse.json(diagnostic);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start diagnostic" }, { status: 400 });
  }
}
