"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentShell } from "@/components/student/surface/student-shell";
import { Card, Eyebrow, buttonClasses } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";

type CompletedDiagnostic = {
  diagnosis: { selectedSubskillId: string; misconceptionTag: string; observation: string; explanation: string; nextStep: string; explanationSource: string };
  practiceSession: { id: string; status: "active"; firstItemId: string | null; itemCount: number };
  practicePlans?: Array<{ id: string; targetSubskillId?: string; title: string; reason: string; itemCount: number; firstItemId?: string; status?: "active" | "complete" }>;
};

function DiagnosisContent() {
  const params = useSearchParams();
  const diagnosticSessionId = params.get("diagnosticSessionId");
  const completedPlanId = params.get("completedPlan");
  const studentId = params.get("studentId");
  const assignmentId = params.get("assignmentId") ?? canonicalDemoIds.diagnosticAssignmentId;
  const router = useRouter();
  const [result, setResult] = useState<CompletedDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedPlanIds, setCompletedPlanIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!studentId) {
      router.replace("/demo");
      return;
    }
    if (!diagnosticSessionId) {
      setError("Complete the diagnostic before viewing your next step.");
      return;
    }
    fetch(`/api/diagnostics/${encodeURIComponent(assignmentId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, diagnosticSessionId }),
    }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setResult)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not create practice"));
  }, [assignmentId, diagnosticSessionId, router, studentId]);

  useEffect(() => {
    if (!studentId) return;
    if (!result?.practicePlans?.length) return;
    Promise.all(result.practicePlans.map(async (plan) => {
      const response = await fetch(`/api/practice/${plan.id}?studentId=${encodeURIComponent(studentId)}`);
      if (!response.ok) return null;
      const practice = await response.json() as { session?: { status?: string } };
      return practice.session?.status === "complete" ? plan.id : null;
    })).then((ids) => setCompletedPlanIds(new Set(ids.filter((id): id is string => Boolean(id)))));
  }, [result, studentId]);

  return (
    <StudentShell size="wide">
      <section className="flex flex-1 items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center lg:gap-12 xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-16 2xl:grid-cols-[24rem_minmax(0,1fr)] 2xl:gap-24">
          <aside className="animate-rise flex flex-col">
            <Eyebrow className="mb-2">Check-in complete</Eyebrow>
            <h1 className="text-balance text-3xl font-extrabold tracking-tight text-ink sm:text-4xl 2xl:text-5xl">
              Here&rsquo;s your next climb.
            </h1>
            <p className="mt-4 text-ink-muted 2xl:text-lg">Start with the skill your check-in flagged, then choose any other fraction skill you have not mastered yet.</p>
          </aside>

          <div className="mx-auto w-full max-w-3xl">
            {!result && <Card className="p-5"><p className="text-ink-muted">{error ?? "Building your focused practice…"}</p></Card>}
            {result && (() => {
              const practicePlans = result.practicePlans?.length
                ? result.practicePlans
                : [{ id: result.practiceSession.id, title: "Focused practice", reason: result.diagnosis.nextStep, itemCount: result.practiceSession.itemCount }];
              const hasMultiplePlans = practicePlans.length > 1;
              const observation = hasMultiplePlans
                ? "Your answers show that these skills are the next useful steps."
                : "Your answers show that this skill is the next useful step.";
              const nextStep = hasMultiplePlans
                ? "Start the focused practice sets."
                : "Start the focused practice set.";

              return <div className="space-y-4">
                <Card className="animate-rise p-6"><Eyebrow className="mb-2">What we noticed</Eyebrow><p className="text-ink">{observation}</p></Card>
                {/* The next step is the payoff of the whole check-in — a gold margin annotation gives it
                    the "here's your momentum" lift instead of blending into another green panel. */}
                <div className="animate-rise border-l-2 border-spark pl-4"><p className="text-sm font-semibold text-spark-ink">Next step</p><p className="mt-1 text-lg text-ink">{nextStep}</p></div>
                <div className="grid gap-3">{practicePlans.map((plan, index) => {
                  const isComplete = completedPlanIds.has(plan.id) || plan.id === completedPlanId;
                  const returnTo = `/student/diagnosis?diagnosticSessionId=${encodeURIComponent(diagnosticSessionId ?? "")}&studentId=${encodeURIComponent(studentId!)}&assignmentId=${encodeURIComponent(assignmentId)}&completedPlan=${encodeURIComponent(plan.id)}`;
                  return <Card key={plan.id} className="flex items-center justify-between gap-4 p-5"><div><p className="font-semibold capitalize text-ink">{plan.title}</p>{index === 0 && <p className="mt-1 text-sm font-medium text-focus">Recommended from your diagnostic</p>}</div>{isComplete ? <span className="text-sm font-semibold text-accent">Completed</span> : <Link href={`/student/practice/${plan.id}?studentId=${encodeURIComponent(studentId!)}&returnTo=${encodeURIComponent(returnTo)}`} className={buttonClasses("focus", "md")}>Start practice</Link>}</Card>;
                })}</div>
              </div>;
            })()}
          </div>
        </div>
      </section>
    </StudentShell>
  );
}

export default function DiagnosisPage() {
  return <Suspense fallback={<StudentShell size="wide"><section className="flex flex-1 flex-col"><p className="text-ink-muted">Loading your diagnosis…</p></section></StudentShell>}><DiagnosisContent /></Suspense>;
}
