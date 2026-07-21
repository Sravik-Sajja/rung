"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FractionExpression } from "@/components/student/fraction";
import { StudentShell } from "@/components/student/surface/student-shell";
import { Card, Eyebrow, VideoEmbed, buttonClasses } from "@/components/ui";
import type { VettedVideo } from "@/lib/types";

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
  video?: VettedVideo | null;
};

const VIDEO_GATE_SECONDS = 45;

function formatCountdown(remainingSeconds: number) {
  return `0:${String(Math.max(remainingSeconds, 0)).padStart(2, "0")}`;
}

function retryDescription(item: PracticeSummary["items"][number]) {
  if (item.correctOnFirstTry) return "Correct on the first try";
  if (item.correct) return `${item.incorrectAttemptCount} ${item.incorrectAttemptCount === 1 ? "retry" : "retries"} before getting it right`;
  return `${item.attemptCount} ${item.attemptCount === 1 ? "attempt" : "attempts"} so far`;
}

/** Completion screen for one practice plan. The API supplies stored attempt counts only. */
export function PracticeSummaryPage({ sessionId, studentId, returnTo }: { sessionId: string; studentId: string; returnTo?: string }) {
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoOpened, setVideoOpened] = useState(false);
  const [watchSeconds, setWatchSeconds] = useState(0);
  const practiceHref = `/student/practice/${sessionId}?studentId=${encodeURIComponent(studentId)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const masteryHref = `/student/mastery?studentId=${encodeURIComponent(studentId)}`;

  useEffect(() => {
    fetch(`/api/practice/${sessionId}/summary?studentId=${encodeURIComponent(studentId)}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setSummary)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load practice summary."));
  }, [sessionId, studentId]);

  useEffect(() => {
    if (!videoOpened) return;
    const interval = setInterval(() => {
      setWatchSeconds((seconds) => Math.min(seconds + 1, VIDEO_GATE_SECONDS));
    }, 1_000);
    return () => clearInterval(interval);
  }, [videoOpened]);

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
  const hasPlayableVideo = Boolean(summary.video?.embedUrl);
  const refresherRequired = totals.incorrectAttemptCount > 0 && hasPlayableVideo;
  const readyToContinue = !refresherRequired || (videoOpened && watchSeconds >= VIDEO_GATE_SECONDS);
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

        {summary.video && refresherRequired && (
          <Card className="space-y-3 border-focus bg-surface-2 p-6 sm:p-8">
            <Eyebrow>Quick refresher</Eyebrow>
            <h2 className="text-lg font-semibold text-ink">Revisit the key idea before moving on.</h2>
            <p className="text-sm text-ink-muted">Watch the refresher to unlock your next step.</p>
            {videoOpened ? (
              <>
                <VideoEmbed video={summary.video} />
                <p className="text-sm font-medium text-focus">
                  {watchSeconds >= VIDEO_GATE_SECONDS
                    ? "Refresher complete. You can continue."
                    : `Keep watching — ${formatCountdown(VIDEO_GATE_SECONDS - watchSeconds)} remaining.`}
                </p>
              </>
            ) : (
              <button type="button" onClick={() => setVideoOpened(true)} className={buttonClasses("secondary", "md")}>
                Play refresher video
              </button>
            )}
          </Card>
        )}

        {summary.video?.embedUrl && !refresherRequired && (
          <details className="rounded-xl border border-border bg-surface-2 p-5">
            <summary className="cursor-pointer text-sm font-medium text-focus">Want a refresher anyway?</summary>
            <div className="mt-4"><VideoEmbed video={summary.video} /></div>
          </details>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          {readyToContinue ? (
            <>
              {returnTo && <Link href={returnTo} className={buttonClasses("focus", "md")}>Back to practice plans</Link>}
              <Link href={masteryHref} className={buttonClasses(returnTo ? "secondary" : "focus", "md")}>See my progress</Link>
            </>
          ) : (
            <button type="button" disabled className={buttonClasses("focus", "md")}>
              {`Watch the refresher — ${formatCountdown(VIDEO_GATE_SECONDS - watchSeconds)} remaining`}
            </button>
          )}
        </div>
      </section>
    </StudentShell>
  );
}
