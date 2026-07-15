// Read-only teacher dashboard endpoint backed by the current deterministic demo projection.
import { NextResponse } from "next/server";
import { getDemoTeacherDashboard } from "@/lib/teacher/grouping";

export async function GET(_request: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const dashboard = getDemoTeacherDashboard(classId);
  if (!dashboard) return NextResponse.json({ error: "Unknown demo class" }, { status: 404 });
  return NextResponse.json(dashboard);
}
