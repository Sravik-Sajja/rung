import { NextResponse } from "next/server";
import { requireStudentActor } from "@/lib/auth/actor";
import { getDemoPracticeSummary } from "@/lib/student/demo-learning-store";
import { getPersistedPracticeSummary } from "@/lib/student/learning-service";

/** Provides the response-history recap shown once a learner finishes a practice plan. */
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const studentId = new URL(request.url).searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "Start your climb before viewing a practice summary." }, { status: 400 });

  try {
    const actor = await requireStudentActor(request, studentId);
    const summary = actor.store === "local_demo"
      ? getDemoPracticeSummary(sessionId, studentId)
      : await getPersistedPracticeSummary({ practiceSessionId: sessionId, studentId });
    if (!summary) return NextResponse.json({ error: "Practice session was not found" }, { status: 404 });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load practice summary" }, { status: 400 });
  }
}
