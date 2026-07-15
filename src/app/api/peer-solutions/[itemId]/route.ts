// Returns locked, approach-only, or full peer content according to deterministic unlock state.
import { NextResponse } from "next/server";
import { getLocalPeerSolution } from "@/lib/student/demo-flow";

export async function GET(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const studentId = new URL(request.url).searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });
  const result = getLocalPeerSolution(studentId, itemId);
  if (!result) return NextResponse.json({ error: "Unknown demo student or item" }, { status: 404 });
  return NextResponse.json(result);
}
