// Read-only group-plan endpoint that returns a seeded cached plan and vetted resource for demo reliability.
import { NextResponse } from "next/server";
import { getTeacherGroupPlan } from "@/lib/teacher/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const result = await getTeacherGroupPlan(groupId);
  if (!result) return NextResponse.json({ error: "Unknown group plan" }, { status: 404 });
  return NextResponse.json(result);
}
