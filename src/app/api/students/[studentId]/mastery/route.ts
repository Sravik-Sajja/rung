import { NextResponse } from "next/server";
import { requireActorClass, requireStudentActor } from "@/lib/auth/actor";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { getDemoStudentMastery } from "@/lib/student/demo-learning-store";
import { getPersistedStudentMastery } from "@/lib/student/learning-service";

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const url = new URL(request.url);
  const topicId = url.searchParams.get("topicId") ?? canonicalDemoIds.fractionsTopicId;
  try {
    const actor = await requireStudentActor(request, studentId);
    // Mastery is per class, so a learner in more than one class must say which
    // one. The actor decides whether the requested class is theirs.
    const classId = requireActorClass(actor, url.searchParams.get("classId"));
    const mastery = actor.store === "local_demo"
      ? { studentId, topicId, skills: getDemoStudentMastery(studentId) }
      : await getPersistedStudentMastery({ studentId, topicId, classId });
    if (!mastery) return NextResponse.json({ error: "Mastery persistence is unavailable" }, { status: 503 });
    return NextResponse.json(mastery);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load mastery" }, { status: 400 });
  }
}
