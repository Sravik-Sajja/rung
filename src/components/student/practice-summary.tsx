"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FractionExpression } from "@/components/student/fraction";
import { StudentShell } from "@/components/student/surface/student-shell";
import { Card, Eyebrow, buttonClasses } from "@/components/ui";

type PracticeSummary = {
  session: { id: string; status: "active" | "complete" };
  totals: {
    totalItemCount: number;
    correctItemCount: number;
    totalAttempts: number;
    incorrectAttemptCount: number;
    correctOnFirstTryCount: number;
  };
  items: Array<{
    itemId: string;
    prompt: string;
    subskillId: string;
    attemptCount: number;
    incorrectAttemptCount: number;
    correct: boolean;
    correctOnFirstTry: boolean;
  }>;
};

function retryDescription(item: PracticeSummary["items"][number]) {
  if (item.correctOnFirstTry) return "Correct on the first try";
  if (item.correct) return `${item.incorrectAttemptCount} ${item.incorrectAttemptCount === 1 ? "retry" : "retries"} before getting it right`;
  return `${item.attemptCount} ${item.attemptCount === 1 ? "attempt" : "attempts"} so far`;
}

/** Completion screen for one practice plan. The API supplies stored attempt counts only. */
export function PracticeSummaryPage({ sessionId, studentId, returnTo }: { sessionId: string; studentId: string; returnTo?: string }) {
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const practiceHref = `/student/practice/${sessionId}?studentId=${encodeURIComponent(studentId)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const masteryHref = `/student/mastery?studentId=${encodeURIComponent(studentId)}`;

  useEffect(() => {
    fetch(`/api/practice/${sessionId}/summary?studentId=${encodeURIComponent(studentId)}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setSummary)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load practice summary."));
  }, [sessionId, studentId]);

  if (!summary) {
    return (
      <StudentShell>
        <section className="flex flex-1 items-center justify-center">
          <p className="text-ink-muted">{error ?? "Loading your practice summary…"}</p>
        </section>
      </StudentShell>
    );
  }

  if (summary.session.status !== "complete") {
    return (
      <StudentShell>
        <section className="mx-auto flex flex-1 w-full max-w-xl items-center justify-center">
          <Card className="w-full space-y-5 p-8 text-center">
            <Eyebrow>Practice in progress</Eyebrow>
            <h1 className="text-2xl font-semibold text-ink">Finish this practice set to see your summary.</h1>
            <Link href={practiceHref} className={buttonClasses("focus", "md")}>Return to practice</Link>
          </Card>
        </section>
      </StudentShell>
    );
  }

  const { totals } = summary;
  return (
    <StudentShell>
      <section className="mx-auto w-full max-w-3xl space-y-6 py-10">
        <div className="text-center">
          <Eyebrow>Practice complete</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Nice work — you finished this practice set.</h1>
          <p className="mt-3 text-ink-muted">You got {totals.correctItemCount} of {totals.totalItemCount} questions correct.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5"><p className="text-sm text-ink-muted">Correct</p><p className="mt-1 text-2xl font-semibold text-accent">{totals.correctItemCount}/{totals.totalItemCount}</p></Card>
          <Card className="p-5"><p className="text-sm text-ink-muted">First-try correct</p><p className="mt-1 text-2xl font-semibold text-ink">{totals.correctOnFirstTryCount}</p></Card>
          <Card className="p-5"><p className="text-sm text-ink-muted">Attempts used</p><p className="mt-1 text-2xl font-semibold text-ink">{totals.totalAttempts}</p></Card>
          <Card className="p-5"><p className="text-sm text-ink-muted">Retries needed</p><p className="mt-1 text-2xl font-semibold text-ink">{totals.incorrectAttemptCount}</p></Card>
        </div>

        <Card className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Your practice</h2>
          <ul className="mt-4 divide-y divide-border">
            {summary.items.map((item, index) => (
              <li key={item.itemId} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0"><p className="text-sm font-medium text-ink-muted">Question {index + 1}</p><FractionExpression text={item.prompt} size="md" className="mt-1 justify-start text-left" /></div>
                <p className={`shrink-0 text-sm font-medium ${item.correctOnFirstTry ? "text-accent" : "text-ink-muted"}`}>{retryDescription(item)}</p>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-wrap justify-center gap-3">
          {returnTo && <Link href={returnTo} className={buttonClasses("focus", "md")}>Back to practice plans</Link>}
          <Link href={masteryHref} className={buttonClasses(returnTo ? "secondary" : "focus", "md")}>See my progress</Link>
        </div>
      </section>
    </StudentShell>
  );
}
