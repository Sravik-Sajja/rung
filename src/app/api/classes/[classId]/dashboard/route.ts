// Read-only teacher dashboard endpoint backed by the current deterministic demo projection.
import { NextResponse } from "next/server";
import { getTeacherDashboard } from "@/lib/teacher/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const dashboard = await getTeacherDashboard(classId);
  if (!dashboard) return NextResponse.json({ error: "Unknown demo class" }, { status: 404 });
  return NextResponse.json(dashboard);
}
