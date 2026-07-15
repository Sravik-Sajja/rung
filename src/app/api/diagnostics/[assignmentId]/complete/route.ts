import { NextResponse } from "next/server";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { requireStudentActor } from "@/lib/auth/actor";
import { completeDemoDiagnostic } from "@/lib/student/demo-learning-store";
import { completePersistedDiagnostic } from "@/lib/student/learning-service";

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const body = await request.json().catch(() => null) as { studentId?: string; diagnosticSessionId?: string } | null;
  if (!body?.studentId || !body.diagnosticSessionId) {
    return NextResponse.json({ error: "studentId and diagnosticSessionId are required" }, { status: 400 });
  }

  try {
    await requireStudentActor(request, body.studentId);
    const completed = await completePersistedDiagnostic({ studentId: body.studentId, diagnosticSessionId: body.diagnosticSessionId })
      ?? completeDemoDiagnostic({ studentId: body.studentId, diagnosticSessionId: body.diagnosticSessionId });
    if (!completed) {
      return NextResponse.json({ error: "Complete every diagnostic item before continuing" }, { status: 400 });
    }

    const supportedTags = completed.diagnosis.evidence.flatMap((entry) => entry.misconceptionTag ? [entry.misconceptionTag] : []);
    if (supportedTags.length) {
      const explanation = await runtimeAiAdapter.diagnoseExplanation({
        studentId: body.studentId,
        assignmentId,
        gradeBand: "6-8",
        targetSubskillId: completed.diagnosis.selectedSubskillId,
        supportedMisconceptionTags: [...new Set(supportedTags)],
        evidence: completed.diagnosis.evidence
          .filter((entry): entry is typeof entry & { misconceptionTag: string } => Boolean(entry.misconceptionTag))
          .map((entry) => ({
            itemId: entry.itemId,
            subskillId: entry.subskillId,
            misconceptionTag: entry.misconceptionTag,
            selectedAnswer: entry.selectedAnswer,
          })),
        promptVersion: "diagnosis-v1",
      });
      completed.diagnosis.observation = explanation.observation;
      completed.diagnosis.explanation = explanation.explanation;
      completed.diagnosis.nextStep = explanation.nextStep;
      completed.diagnosis.explanationSource = explanation.source;
    }

    return NextResponse.json(completed);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete diagnostic" }, { status: 400 });
  }
}
