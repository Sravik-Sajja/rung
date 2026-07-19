import { NextResponse } from "next/server";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { requireStudentActor } from "@/lib/auth/actor";
import { applyGeneratedDemoPracticePlans, completeDemoDiagnostic, createGeneratedDemoPracticeSession, getOrCreateDemoDiagnosticPracticePlans } from "@/lib/student/demo-learning-store";
import {
  finalizePersistedDiagnosticCompletion,
  finalizePersistedAllMasteredDiagnostic,
  preparePersistedDiagnosticCompletion,
  type GeneratedPersistedPlan,
} from "@/lib/student/learning-service";

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const body = await request.json().catch(() => null) as { studentId?: string; diagnosticSessionId?: string } | null;
  if (!body?.studentId || !body.diagnosticSessionId) {
    return NextResponse.json({ error: "studentId and diagnosticSessionId are required" }, { status: 400 });
  }

  try {
    const actor = await requireStudentActor(request, body.studentId);
    // Only an assignment-bound session is restricted to one diagnostic. A
    // walkthrough participant carries no assignment and is not limited here.
    if (actor.assignmentId && actor.assignmentId !== assignmentId) {
      return NextResponse.json({ error: "This joined student session cannot access that diagnostic." }, { status: 403 });
    }
    if (actor.store === "persisted") {
      // A durable actor owns this path end-to-end. Never create a static bank
      // session or fall back to the local store after persistence is selected.
      const persisted = await preparePersistedDiagnosticCompletion({
        studentId: body.studentId,
        diagnosticSessionId: body.diagnosticSessionId,
      });
      if (!persisted) return NextResponse.json({ error: "Diagnostic persistence is unavailable" }, { status: 503 });
      if (persisted.kind === "complete") return NextResponse.json(persisted.completion);

      const supportedTags = persisted.diagnosis.evidence.flatMap((entry) => entry.misconceptionTag ? [entry.misconceptionTag] : []);
      let narrative = {
        observation: persisted.diagnosis.observation,
        explanation: persisted.diagnosis.explanation,
        nextStep: persisted.diagnosis.nextStep,
        explanationSource: persisted.diagnosis.explanationSource,
        explanationAiRunRef: undefined as string | undefined,
      };
      if (supportedTags.length) {
        const explanation = await runtimeAiAdapter.diagnoseExplanation({
          studentId: body.studentId,
          assignmentId: persisted.assignmentId,
          gradeBand: "6-8",
          targetSubskillId: persisted.diagnosis.selectedSubskillId,
          supportedMisconceptionTags: [...new Set(supportedTags)],
          evidence: persisted.diagnosis.evidence
            .filter((entry): entry is typeof entry & { misconceptionTag: string } => Boolean(entry.misconceptionTag))
            .map((entry) => ({
              itemId: entry.itemId,
              subskillId: entry.subskillId,
              misconceptionTag: entry.misconceptionTag,
              selectedAnswer: entry.selectedAnswer,
            })),
          promptVersion: "diagnosis-v1",
        });
        narrative = {
          observation: explanation.observation,
          explanation: explanation.explanation,
          nextStep: explanation.nextStep,
          explanationSource: explanation.source,
          explanationAiRunRef: explanation.aiRunId,
        };
      }

      if (!persisted.targets.length) {
        return NextResponse.json(await finalizePersistedAllMasteredDiagnostic({ preparation: persisted, narrative }));
      }

      // GPT proposes only parameters. The persistence service invokes the
      // shared deterministic materializer before the atomic finalizer RPC.
      const plans = await Promise.all(persisted.targets.map(async (target): Promise<GeneratedPersistedPlan> => {
        const generated = await runtimeAiAdapter.generatePracticePlan({
          studentId: body.studentId!,
          targetSubskillId: target.subskillId,
          misconceptionTags: [target.misconceptionTag],
          promptVersion: "practice-plan-v1",
        });
        const readableSkill = target.subskillId.replaceAll("-", " ");
        return {
          targetSubskillId: target.subskillId,
          misconceptionTag: target.misconceptionTag,
          title: readableSkill,
          reason: `Assigned because you missed ${readableSkill}.`,
          generationSource: generated.source,
          generationPromptVersion: generated.promptVersion,
          generationAiRunRef: generated.aiRunId,
          items: generated.items,
        };
      }));
      const completion = await finalizePersistedDiagnosticCompletion({
        preparation: persisted,
        narrative,
        plans,
      });
      return NextResponse.json(completion);
    }

    // Local demo actors use only the isolated in-memory rehearsal store.
    const demoCompletion = completeDemoDiagnostic({ studentId: body.studentId, diagnosticSessionId: body.diagnosticSessionId });
    if (!demoCompletion) {
      return NextResponse.json({ error: "Complete every diagnostic item before continuing" }, { status: 400 });
    }
    if (demoCompletion.allMastered) return NextResponse.json(demoCompletion);
    if (demoCompletion.practicePlans?.length) return NextResponse.json(demoCompletion);

    const supportedTags = demoCompletion.diagnosis.evidence.flatMap((entry) => entry.misconceptionTag ? [entry.misconceptionTag] : []);
    if (supportedTags.length) {
      const explanation = await runtimeAiAdapter.diagnoseExplanation({
        studentId: body.studentId,
        assignmentId,
        gradeBand: "6-8",
        targetSubskillId: demoCompletion.diagnosis.selectedSubskillId,
        supportedMisconceptionTags: [...new Set(supportedTags)],
        evidence: demoCompletion.diagnosis.evidence
          .filter((entry): entry is typeof entry & { misconceptionTag: string } => Boolean(entry.misconceptionTag))
          .map((entry) => ({
            itemId: entry.itemId,
            subskillId: entry.subskillId,
            misconceptionTag: entry.misconceptionTag,
            selectedAnswer: entry.selectedAnswer,
        })),
        promptVersion: "diagnosis-v1",
      });
      demoCompletion.diagnosis.observation = explanation.observation;
      demoCompletion.diagnosis.explanation = explanation.explanation;
      demoCompletion.diagnosis.nextStep = explanation.nextStep;
      // The original local-store completion predates live/cache source values,
      // but the runtime object safely carries the same contract as persisted
      // completions.
      (demoCompletion.diagnosis as { explanationSource: "ai" | "cache" | "fallback" }).explanationSource = explanation.source;
    }

    // A live model proposes only fraction operands; deterministic code computes every answer,
    // constructs the prompt, and rejects malformed output before it reaches the learner.
    const diagnosticTargets = (demoCompletion.diagnosis as typeof demoCompletion.diagnosis & { practicePlanTargets?: Array<{ subskillId: string; misconceptionTag: string }> }).practicePlanTargets;
    const targets = diagnosticTargets?.length
      ? diagnosticTargets
      : [{ subskillId: demoCompletion.diagnosis.selectedSubskillId, misconceptionTag: demoCompletion.diagnosis.misconceptionTag }];
    const enriched = await getOrCreateDemoDiagnosticPracticePlans({
      diagnosticSessionId: body.diagnosticSessionId,
      studentId: body.studentId,
      build: async () => {
        const generatedPlans = await Promise.all(targets.map(async (target) => {
          const misconceptionTag = target.misconceptionTag ?? "needs-practice";
          const targetSubskillId = target.subskillId ?? demoCompletion.diagnosis.selectedSubskillId ?? "find-common-denominator";
          return {
            targetSubskillId,
            misconceptionTag,
            items: (await runtimeAiAdapter.generatePracticePlan({ studentId: body.studentId!, targetSubskillId, misconceptionTags: [misconceptionTag], promptVersion: "practice-plan-v1" })).items,
          };
        }));

        const appliedPlans = generatedPlans.map((plan, index) => {
          const practiceSessionId = index === 0 ? demoCompletion.practiceSession.id : createGeneratedDemoPracticeSession(body.studentId!);
          const applied = applyGeneratedDemoPracticePlans({ practiceSessionId, studentId: body.studentId!, plans: [plan] });
          if (!applied) throw new Error("Generated practice plan failed deterministic validation.");
          return {
            summary: {
              id: practiceSessionId,
              targetSubskillId: plan.targetSubskillId,
              title: plan.targetSubskillId.replaceAll("-", " "),
              reason: `Assigned because you missed ${plan.targetSubskillId.replaceAll("-", " ")}.`,
              itemCount: applied.itemCount,
              firstItemId: applied.firstItemId,
              status: "active" as const,
            },
            firstItemId: applied.firstItemId,
          };
        });
        const first = appliedPlans[0];
        if (!first) throw new Error("No generated practice plans were available.");
        return {
          practicePlans: appliedPlans.map((plan) => plan.summary),
          firstItemId: first.firstItemId,
          firstItemCount: first.summary.itemCount,
        };
      },
    });
    if (!enriched) return NextResponse.json({ error: "Diagnostic session was not found" }, { status: 400 });
    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete diagnostic" }, { status: 400 });
  }
}
