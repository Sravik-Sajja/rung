// Returns a learner's ordered practice cards without answer-bearing solution data.
import { NextResponse } from "next/server";
import { getLocalPracticeSession } from "@/lib/student/demo-flow";

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const studentId = new URL(request.url).searchParams.get("studentId") ?? undefined;
  const session = getLocalPracticeSession(sessionId, studentId);
  if (!session) return NextResponse.json({ error: "Unknown practice session" }, { status: 404 });
  return NextResponse.json(session);
}
