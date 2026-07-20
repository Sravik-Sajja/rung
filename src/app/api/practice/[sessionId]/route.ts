import { NextResponse } from "next/server";
import { requireStudentActor } from "@/lib/auth/actor";
import { getDemoPractice } from "@/lib/student/demo-learning-store";
import { getPersistedPractice } from "@/lib/student/learning-service";
import { getVideoForSubskill } from "@/lib/student/videos";

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
    // The plan's subskill video, included here so the practice client (and the WS3 recap/gate)
    // needs no extra round trip. Derived from the first item, matching how the base demo practice
    // set is built (focused on one gap skill, occasionally widened by a hinted prerequisite).
    const subskillId = practice.items[0]?.subskillId;
    const video = subskillId ? await getVideoForSubskill({ subskillId, store: actor.store }) : null;
    return NextResponse.json({
      ...practice,
      progress: { completedItemCount: completed, totalItemCount: practice.items.length },
      video,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load practice" }, { status: 400 });
  }
}
