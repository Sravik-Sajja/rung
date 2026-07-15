// Completes a seeded diagnostic, derives a supported misconception, and creates the ordered practice session.
import { NextResponse } from "next/server";
import { completeLocalDiagnostic } from "@/lib/student/demo-flow";
import { z } from "zod";

const requestSchema = z.object({ studentId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const body = requestSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid diagnostic completion request" }, { status: 400 });
  const { assignmentId } = await params;
  const result = await completeLocalDiagnostic(assignmentId, body.data.studentId);
  if (!result) return NextResponse.json({ error: "Unknown assignment or demo student" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
