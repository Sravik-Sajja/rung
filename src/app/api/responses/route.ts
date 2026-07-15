// Server-owned answer submission: deterministic scoring and the next permitted state.
import { NextResponse } from "next/server";
import { requireStudentActor } from "@/lib/auth/actor";
import { recordDemoDiagnosticResponse, recordDemoPracticeResponse } from "@/lib/student/demo-learning-store";
import { recordPersistedDiagnosticResponse, recordPersistedPracticeResponse } from "@/lib/student/learning-service";
import { responseSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const result = responseSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });

  try {
    await requireStudentActor(request, result.data.studentId);
    if (result.data.context === "diagnostic") {
      const persisted = await recordPersistedDiagnosticResponse(result.data);
      const response = persisted ?? recordDemoDiagnosticResponse(result.data);
      if (!response) {
        return NextResponse.json({ error: "Diagnostic session or item was not found" }, { status: 404 });
      }
      return NextResponse.json({ ...response, normalizedAnswer: result.data.answer.trim() });
    }

    const persisted = await recordPersistedPracticeResponse(result.data);
    const response = persisted ?? recordDemoPracticeResponse(result.data);
    if (!response) {
      return NextResponse.json({ error: "Practice session or item was not found" }, { status: 404 });
    }
    return NextResponse.json({ ...response, normalizedAnswer: result.data.answer.trim() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record response" }, { status: 400 });
  }
}
