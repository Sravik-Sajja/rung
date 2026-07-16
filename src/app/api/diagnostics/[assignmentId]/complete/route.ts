import { NextResponse } from "next/server";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { requireStudentActor } from "@/lib/auth/actor";
import { completeDemoDiagnostic } from "@/lib/student/demo-learning-store";
import { applyGeneratedDemoPracticePlans, createGeneratedDemoPracticeSession } from "@/lib/student/demo-learning-store";
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

    // A live model proposes only fraction operands; deterministic code computes every answer,
    // constructs the prompt, and rejects malformed output before it reaches the learner.
    const targets = (completed.diagnosis as typeof completed.diagnosis & { practicePlanTargets?: Array<{ subskillId: string; misconceptionTag: string }> }).practicePlanTargets
      ?? [{ subskillId: completed.diagnosis.selectedSubskillId, misconceptionTag: completed.diagnosis.misconceptionTag }];
    const generatedPlans = await Promise.all(targets.map(async (target) => {
      const misconceptionTag = target.misconceptionTag ?? "needs-practice";
      const targetSubskillId = target.subskillId ?? completed.diagnosis.selectedSubskillId ?? "find-common-denominator";
      return {
        targetSubskillId,
        misconceptionTag,
        items: (await runtimeAiAdapter.generatePracticePlan({ studentId: body.studentId!, targetSubskillId, misconceptionTags: [misconceptionTag], promptVersion: "practice-plan-v1" })).items,
      };
    }));
    const practicePlans = generatedPlans.flatMap((plan, index) => {
      const practiceSessionId = index === 0 ? completed.practiceSession.id : createGeneratedDemoPracticeSession(body.studentId!);
      const applied = applyGeneratedDemoPracticePlans({ practiceSessionId, studentId: body.studentId!, plans: [plan] });
      return applied ? [{ id: practiceSessionId, title: plan.targetSubskillId.replaceAll("-", " "), reason: `Assigned because you missed ${plan.targetSubskillId.replaceAll("-", " ")}.`, itemCount: applied.itemCount }] : [];
    });
    if (practicePlans[0]) {
      completed.practiceSession.firstItemId = practicePlans[0].id;
      completed.practiceSession.itemCount = practicePlans[0].itemCount;
    }

    return NextResponse.json({ ...completed, practicePlans });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete diagnostic" }, { status: 400 });
  }
}
