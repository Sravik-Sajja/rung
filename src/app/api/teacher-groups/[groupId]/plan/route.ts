// Read-only group-plan endpoint that returns a seeded cached plan and vetted resource for demo reliability.
import { NextResponse } from "next/server";
import { getDemoTeacherGroup, getDemoTeacherGroupPlan } from "@/lib/teacher/grouping";

export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = getDemoTeacherGroup(groupId);
  const plan = getDemoTeacherGroupPlan(groupId);
  if (!group || !plan) return NextResponse.json({ error: "Unknown group plan" }, { status: 404 });
  return NextResponse.json({ group, plan });
}
