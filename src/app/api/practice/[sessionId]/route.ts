import { NextResponse } from "next/server";
import { requireStudentActor } from "@/lib/auth/actor";
import { getDemoPractice } from "@/lib/student/demo-learning-store";
import { getPersistedPractice } from "@/lib/student/learning-service";

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const studentId = new URL(request.url).searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "Start your climb before opening practice." }, { status: 400 });

  try {
    const actor = await requireStudentActor(request, studentId);
    const practice = actor.store === "local_demo"
      ? getDemoPractice(sessionId, studentId)
      : await getPersistedPractice({ practiceSessionId: sessionId, studentId });
    if (!practice) {
      return NextResponse.json({ error: "Practice session was not found" }, { status: 404 });
    }

    const completed = practice.items.filter((item) => item.status === "correct").length;
    return NextResponse.json({
      ...practice,
      progress: { completedItemCount: completed, totalItemCount: practice.items.length },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load practice" }, { status: 400 });
  }
}
