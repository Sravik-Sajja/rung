import { NextResponse } from "next/server";
import { requireStudentActor } from "@/lib/auth/actor";
import { getDemoStudentWork, getPersistedStudentWork } from "@/lib/student/work-history";

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  try {
    // `requireStudentActor` is the ownership check: a caller can only ever read their own work.
    const actor = await requireStudentActor(request, studentId);
    const sessions = actor.store === "local_demo"
      ? getDemoStudentWork(studentId)
      : await getPersistedStudentWork({ studentId });
    if (!sessions) return NextResponse.json({ error: "Work history persistence is unavailable" }, { status: 503 });
    return NextResponse.json({ studentId, sessions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your work" }, { status: 400 });
  }
}
