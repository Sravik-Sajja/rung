"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentShell } from "@/components/student/surface/student-shell";
import { Card, Eyebrow, buttonClasses } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { formatCompletedAt, groupItemsById, WorkItemReview } from "@/components/student/work-item-review";
import type { StudentWorkSession } from "@/lib/student/work-history";

// Shared shape for both diagnostic-origin and teacher-origin plan cards (WS C). `source` is
// optional because the completion POST's `practicePlans` predates the teacher-assignment feature
// and never sends it — those are always diagnostic plans regardless.
type PlanSummary = { id: string; targetSubskillId?: string; title: string; reason: string; itemCount: number; firstItemId?: string; status?: "active" | "complete"; source?: "diagnostic" | "teacher" };

type CompletedDiagnostic = {
  diagnosis: { selectedSubskillId: string; misconceptionTag: string; observation: string; explanation: string; nextStep: string; explanationSource: string };
  practiceSession: { id: string; status: "active" | "complete"; firstItemId: string | null; itemCount: number };
  practicePlans?: PlanSummary[];
  allMastered?: boolean;
};

/**
 * "How you did, question by question" (WS4b) — the first and only place diagnostic item results
 * are shown to a student. Renders below the plan cards (a review, not the headline) and only after
 * the diagnosis has already been generated, which is exactly when this component mounts. Prefers
 * matching `sessionId === diagnosticSessionId`; falls back to the single diagnostic session if for
 * some reason ids don't line up (session id can be awkward to thread through in demo mode), so a
 * student is never shown someone else's — or no — recap for a check-in they just completed.
 */
function DiagnosticReveal({ studentId, diagnosticSessionId }: { studentId: string; diagnosticSessionId: string | null }) {
  const [sessions, setSessions] = useState<StudentWorkSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/students/${encodeURIComponent(studentId)}/work`)
      .then(async (response) => (response.ok ? response.json() : Promise.reject(new Error((await response.json()).error))))
      .then((data: { sessions: StudentWorkSession[] }) => setSessions(data.sessions))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load your check-in results"));
  }, [studentId]);

  if (!sessions) {
    return <p className="mt-10 text-sm text-ink-muted">{error ?? "Loading your check-in results…"}</p>;
  }

  const diagnosticSessions = sessions.filter((session) => session.kind === "diagnostic");
  const session = (diagnosticSessionId && diagnosticSessions.find((candidate) => candidate.sessionId === diagnosticSessionId)) ?? diagnosticSessions[0];
  // Nothing to show yet (evidence lags a beat behind plan generation in some edge cases) — the
  // plan cards above are the primary content either way, so this section just quietly omits itself.
  if (!session) return null;

  const groups = groupItemsById(session.items);

  return (
    <section className="mt-10 border-t border-border pt-8">
      <Eyebrow className="mb-2">Review</Eyebrow>
      <h2 className="text-xl font-bold tracking-tight text-ink">How you did, question by question</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Your check-in from {formatCompletedAt(session.completedAt)} — {session.firstTryCount} of {session.totalCount} first try.
      </p>
      <ul className="mt-4 space-y-4">
        {groups.map((group) => (
          <WorkItemReview key={group.itemId} group={group} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Teacher-assigned practice (WS C), rendered above the diagnostic plan list. These plans have no
 * diagnostic session behind them, so they get their own eyebrow rather than being folded into the
 * diagnostic list — mixing them in would misattribute them and would shift the "Recommended from
 * your diagnostic" badge (which is hard-coded to index 0) onto the wrong card. Card markup and the
 * Start-practice/Completed affordances are identical to the diagnostic cards on purpose.
 */
function AssignedPlanCards({
  plans,
  completedPlanIds,
  completedPlanId,
  diagnosticSessionId,
  studentId,
  assignmentId,
}: {
  plans: PlanSummary[];
  completedPlanIds: Set<string>;
  completedPlanId: string | null;
  diagnosticSessionId: string | null;
  studentId: string;
  assignmentId: string;
}) {
  if (!plans.length) return null;
  return (
    <div className="mb-6 space-y-3">
      <Eyebrow>From your teacher</Eyebrow>
      <div className="grid gap-3">
        {plans.map((plan) => {
          const isComplete = completedPlanIds.has(plan.id) || plan.id === completedPlanId;
          // Same returnTo pattern as the diagnostic cards, including the possibly-empty
          // diagnosticSessionId — the practice loop and its recap don't care which list a plan
          // came from, only that returning here lands back on this hub.
          const returnTo = `/student/diagnosis?diagnosticSessionId=${encodeURIComponent(diagnosticSessionId ?? "")}&studentId=${encodeURIComponent(studentId)}&assignmentId=${encodeURIComponent(assignmentId)}&completedPlan=${encodeURIComponent(plan.id)}`;
          return (
            <Card key={plan.id} className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-semibold capitalize text-ink">{plan.title}</p>
              </div>
              {isComplete ? (
                <span className="text-sm font-semibold text-accent">Completed</span>
              ) : (
                <Link
                  href={`/student/practice/${plan.id}?studentId=${encodeURIComponent(studentId)}&returnTo=${encodeURIComponent(returnTo)}`}
                  className={buttonClasses("focus", "md")}
                >
                  Start practice
                </Link>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

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
  // null = still loading, [] = loaded with nothing assigned. Kept separate from `result` because
  // a student can reach this hub with teacher-assigned plans and NO diagnostic session at all.
  const [teacherPlans, setTeacherPlans] = useState<PlanSummary[] | null>(null);
  const hasDiagnostic = Boolean(diagnosticSessionId);

  useEffect(() => {
    if (!studentId) {
      router.replace("/demo");
      return;
    }
    // Nothing to complete when there's no diagnostic session — this can be a teacher-only hub
    // (see the current-diagnostic effect below), which is a normal state, not an error.
    if (!diagnosticSessionId) return;
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
    // The completion POST response never includes teacher plans (WS A), so this hub always
    // consults current-diagnostic separately to pick them up. When a diagnostic completion is in
    // flight, wait for it to resolve first — firing immediately would race the store write that
    // POST just triggered and could show a stale plan list. With no diagnostic session at all
    // there's nothing to wait for, so fetch right away.
    if (diagnosticSessionId && !result) return;
    let cancelled = false;
    fetch(`/api/students/${encodeURIComponent(studentId)}/current-diagnostic`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load current diagnostic"))))
      .then((data: { practicePlans: PlanSummary[] }) => {
        if (cancelled) return;
        const diagnosticIds = new Set((result?.practicePlans ?? []).map((plan) => plan.id));
        setTeacherPlans(data.practicePlans.filter((plan) => plan.source === "teacher" && !diagnosticIds.has(plan.id)));
      })
      .catch(() => {
        if (!cancelled) setTeacherPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, diagnosticSessionId, result]);

  useEffect(() => {
    if (!studentId) return;
    const combined = [...(result?.practicePlans ?? []), ...(teacherPlans ?? [])];
    if (!combined.length) return;
    let cancelled = false;
    Promise.all(combined.map(async (plan) => {
      const response = await fetch(`/api/practice/${plan.id}?studentId=${encodeURIComponent(studentId)}`);
      if (!response.ok) return null;
      const practice = await response.json() as { session?: { status?: string } };
      return practice.session?.status === "complete" ? plan.id : null;
    })).then((ids) => {
      if (!cancelled) setCompletedPlanIds(new Set(ids.filter((id): id is string => Boolean(id))));
    });
    return () => {
      cancelled = true;
    };
  }, [result, teacherPlans, studentId]);

  return (
    <StudentShell size="wide" studentId={studentId ?? undefined}>
      <section className="flex flex-1 items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center lg:gap-12 xl:grid-cols-[20rem_minmax(0,1fr)] xl:gap-16 2xl:grid-cols-[24rem_minmax(0,1fr)] 2xl:gap-24">
          <aside className="animate-rise flex flex-col">
            <Eyebrow className="mb-2">{hasDiagnostic ? "Check-in complete" : "Practice assigned"}</Eyebrow>
            <h1 className="text-balance text-3xl font-extrabold tracking-tight text-ink sm:text-4xl 2xl:text-5xl">
              Here&rsquo;s your next climb.
            </h1>
            <p className="mt-4 text-ink-muted 2xl:text-lg">
              {hasDiagnostic
                ? "Start with the skill your check-in flagged, then choose any other fraction skill you have not mastered yet."
                : "Your teacher assigned focused practice below."}
            </p>
          </aside>

          <div className="mx-auto w-full max-w-3xl">
            {/* Teacher-assigned plans sit above diagnostic content in every state (WS C) — a
                teacher-only hub (no diagnostic session at all) renders nothing else below. */}
            {teacherPlans && teacherPlans.length > 0 && (
              <AssignedPlanCards
                plans={teacherPlans}
                completedPlanIds={completedPlanIds}
                completedPlanId={completedPlanId}
                diagnosticSessionId={diagnosticSessionId}
                studentId={studentId!}
                assignmentId={assignmentId}
              />
            )}

            {!hasDiagnostic && teacherPlans === null && (
              <Card className="p-5"><p className="text-ink-muted">Loading your plan…</p></Card>
            )}
            {!hasDiagnostic && teacherPlans !== null && teacherPlans.length === 0 && (
              <Card className="p-5"><p className="text-ink-muted">{error ?? "Complete the diagnostic before viewing your next step."}</p></Card>
            )}

            {hasDiagnostic && !result && <Card className="p-5"><p className="text-ink-muted">{error ?? "Building your focused practice…"}</p></Card>}
            {hasDiagnostic && result && (() => {
              if (result.allMastered) {
                return <Card className="animate-rise border-mastery-mastered bg-elevated p-7 sm:p-8">
                  <Eyebrow className="mb-3">All skills mastered</Eyebrow>
                  <h2 className="text-2xl font-bold tracking-tight text-ink">You&rsquo;re ready for your next climb.</h2>
                  <p className="mt-3 max-w-xl text-ink-muted">Your check-in shows that you have already mastered the skills in this set. There is no focused practice to complete right now.</p>
                  <div className="mt-6"><Link href={`/student/mastery?studentId=${encodeURIComponent(studentId!)}`} className={buttonClasses("focus", "md")}>View your skill climb</Link></div>
                </Card>;
              }
              const practicePlans = result.practicePlans?.length
                ? result.practicePlans
                : [{ id: result.practiceSession.id, title: "Focused practice", reason: result.diagnosis.nextStep, itemCount: result.practiceSession.itemCount }];
              const hasMultiplePlans = practicePlans.length > 1;
              const nextStep = hasMultiplePlans
                ? "Start the focused practice sets."
                : "Start the focused practice set.";

              return <div className="space-y-4">
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
            {hasDiagnostic && result && studentId && <DiagnosticReveal studentId={studentId} diagnosticSessionId={diagnosticSessionId} />}
          </div>
        </div>
      </section>
    </StudentShell>
  );
}

export default function DiagnosisPage() {
  return <Suspense fallback={<StudentShell size="wide"><section className="flex flex-1 flex-col"><p className="text-ink-muted">Loading your diagnosis…</p></section></StudentShell>}><DiagnosisContent /></Suspense>;
}
