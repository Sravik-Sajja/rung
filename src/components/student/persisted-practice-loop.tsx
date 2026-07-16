"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StudentShell } from "@/components/student/surface/student-shell";
import { RungProgress } from "@/components/student/surface/rung-progress";
import { FractionExpression } from "@/components/student/fraction";
import { FractionInput, answerModeForSubskill } from "@/components/student/fraction-input";
import { HintLadder, type HintLevel } from "@/components/student/hint-ladder";
import { WorkHelpCard } from "@/components/student/work-help-card";
import { buttonClasses } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";

type PracticeItem = { practiceSessionItemId: string; itemId: string; subskillId: string; prompt: string; position: number; status: "pending" | "missed" | "requeued" | "correct"; isResurfaced: boolean; peerGate: { approachUnlocked: boolean; fullSolutionUnlocked: boolean }; plan?: { subskillId: string; title: string; reason: string } };
// `progress` only exists on the GET /api/practice payload — the POST /api/responses `practice`
// object omits it — so the UI derives counts from `items` instead of reading it.
type Practice = { session: { id: string; studentId: string; status: "active" | "complete"; currentItemId: string | null }; items: PracticeItem[]; progress?: { completedItemCount: number; totalItemCount: number } };

// The external action button submits the FractionInput's form via the `form` attribute, so
// Check and Next can morph in one fixed position at the bottom of the card (mirrors the
// diagnostic page's ANSWER_FORM_ID pattern).
const ANSWER_FORM_ID = "practice-answer-form";

// Decorative ladder rungs for the side margins on very wide screens — copied locally (not
// imported) to match the diagnostic page's ambient frame without creating a cross-file dependency.
const RUNG_MOTIF_OPACITIES = [0.16, 0.3, 0.45, 0.62, 0.8];

function RungMotif({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 hidden flex-col justify-center gap-10 xl:flex 2xl:gap-12 ${
        side === "left" ? "left-2 2xl:left-10" : "right-2 2xl:right-10"
      }`}
    >
      {RUNG_MOTIF_OPACITIES.map((opacity, index) => (
        <span key={index} className="h-1 w-12 rounded-full bg-border-strong 2xl:w-16" style={{ opacity }} />
      ))}
    </div>
  );
}

export function PersistedPracticeLoop({ sessionId }: { sessionId: string }) {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [nextPractice, setNextPractice] = useState<Practice | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [activeHint, setActiveHint] = useState<HintLevel | undefined>();
  const [hintText, setHintText] = useState<string>();
  const [hintLoading, setHintLoading] = useState(false);
  const [lastAttempt, setLastAttempt] = useState("");
  // This is an escalation, not another first-attempt aid: the learner must
  // use a substantive hint and then miss the same item again.
  const [workHelpEligible, setWorkHelpEligible] = useState(false);
  const [answerRevision, setAnswerRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Progressive disclosure: the hint ladder starts behind a quiet affordance;
  // work help appears only after another missed response following a real hint.
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/practice/${sessionId}?studentId=${canonicalDemoIds.mayaStudentId}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setPractice)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load practice"));
  }, [sessionId]);

  const current = practice?.items.find((item) => item.status !== "correct") ?? null;

  async function submit(answer: string) {
    if (!current || !practice) return;
    const hadSubstantiveHint = activeHint === "hint" || activeHint === "guided_step";
    setError(null);
    setLastAttempt(answer);
    const response = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: canonicalDemoIds.mayaStudentId, context: "practice", practiceSessionId: practice.session.id, practiceSessionItemId: current.practiceSessionItemId, itemId: current.itemId, answer }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Could not record answer");
      return;
    }
    setLastCorrect(Boolean(body.isCorrect));
    if (body.isCorrect) setNextPractice(body.practice);
    else {
      setPractice(body.practice);
      if (hadSubstantiveHint) setWorkHelpEligible(true);
    }
  }

  function tryAgain() {
    setLastCorrect(false);
    setAnswerRevision((currentRevision) => currentRevision + 1);
  }

  function nextQuestion() {
    if (!nextPractice) return;
    setPractice(nextPractice);
    setNextPractice(null);
    setLastCorrect(false);
    setActiveHint(undefined);
    setHintText(undefined);
    setLastAttempt("");
    setWorkHelpEligible(false);
    setAnswerRevision((currentRevision) => currentRevision + 1);
    setHintOpen(false);
  }

  async function requestHint(level: HintLevel) {
    if (!current) return;
    setError(null);
    setHintLoading(true);
    try {
      const response = await fetch("/api/tutor/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: canonicalDemoIds.mayaStudentId,
          itemId: current.itemId,
          practiceSessionId: practice?.session.id,
          attempt: lastAttempt,
          level,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load a hint right now.");
      setActiveHint(level);
      setHintText(body.hint);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load a hint right now.");
    } finally {
      setHintLoading(false);
    }
  }

  if (!practice || !current) {
    return (
      <StudentShell size="wide">
        <section className="relative flex flex-1 items-center justify-center">
          <p className="text-ink-muted">{error ?? "Loading focused practice…"}</p>
        </section>
      </StudentShell>
    );
  }

  const sessionWillComplete = nextPractice?.session.status === "complete";
  // Rung count is derived from the items themselves (the same formula the GET route uses for its
  // `progress` field, which POST responses omit), not the item's own position, since resurfaced
  // items can revisit an earlier rung without moving the count backwards.
  const completedItemCount = practice.items.filter((item) => item.status === "correct").length;
  const totalItemCount = practice.items.length;
  const questionNumber = Math.min(completedItemCount + 1, totalItemCount);
  // Hints only unlock once the server has actually recorded a miss on this item — never offered
  // pre-emptively on a first attempt.
  const showMissed = !lastCorrect && current.status === "missed";
  const workHelpSupportLevel = activeHint === "hint" || activeHint === "guided_step" ? activeHint : null;
  const showWorkHelp = showMissed && workHelpEligible && workHelpSupportLevel !== null;

  return (
    <StudentShell size="wide">
      {/* One centered reading column, mirroring the diagnostic's ambient frame: a soft glow and
          ladder motif treat the space beside the focal card as designed quiet, not empty. */}
      <section className="relative flex flex-1 items-center justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-full max-w-[52rem] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--spark-soft), transparent)" }}
        />
        <RungMotif side="left" />
        <RungMotif side="right" />

        <div className="relative mx-auto w-full max-w-3xl py-8">
          <div className="space-y-6">
            <h1 className="sr-only">Focused practice</h1>
            <div key={`${current.practiceSessionItemId}-progress`} className="animate-rise">
              <RungProgress current={questionNumber} total={totalItemCount} label="Question" />
            </div>

            {/* One elevated card is the single focal point, keyed on the item so it rises in fresh
                each question. Two zones: question, then answer + help + one morphing action button. */}
            <div key={current.practiceSessionItemId} className="animate-rise rounded-2xl border border-border bg-elevated shadow-lg">
              <div className="flex flex-col items-center gap-3 p-8 text-center sm:p-10 2xl:p-14">
                {current.plan && <div className="w-full rounded-lg border border-focus bg-focus-soft p-3 text-left"><p className="text-xs font-semibold uppercase tracking-wide text-focus">Practice plan: {current.plan.title}</p><p className="mt-1 text-sm text-ink-muted">{current.plan.reason}</p></div>}
                {current.isResurfaced && (
                  <span className="inline-flex items-center rounded-full border border-spark bg-spark-soft px-3 py-1 text-xs font-semibold text-spark-ink">
                    Quick revisit
                  </span>
                )}
                <FractionExpression text={current.prompt} size="lg" className="justify-center 2xl:text-4xl" />
              </div>

              <div className="flex flex-col items-center gap-6 border-t border-border p-8 sm:p-10 2xl:p-12">
                <FractionInput
                  key={`${current.practiceSessionItemId}-${answerRevision}`}
                  formId={ANSWER_FORM_ID}
                  showSubmit={false}
                  label={`Your answer to ${current.prompt}`}
                  disabled={lastCorrect}
                  onSubmit={submit}
                  className="items-center text-center"
                  defaultMode={answerModeForSubskill(current.subskillId)}
                />

                <div aria-live="polite" className="flex w-full flex-col items-center gap-3 empty:hidden">
                  {lastCorrect && (
                    // Green is reserved for correct/mastery — the one moment this surface uses it.
                    <p className="animate-pop flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-4 py-2.5 text-sm font-semibold text-accent">
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-current">
                        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                      </svg>
                      Correct!
                    </p>
                  )}
                  {showMissed && (
                    <div className="w-full rounded-lg border border-border bg-surface-2 p-4 text-left" role="status">
                      <p className="text-sm font-semibold text-ink">Not yet — you&rsquo;ve got this.</p>
                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        <button type="button" onClick={tryAgain} className={buttonClasses("secondary", "md")}>
                          Try again
                        </button>
                      </div>
                    </div>
                  )}
                  {error && <p className="text-sm text-danger">{error}</p>}
                </div>

                {!lastCorrect ? (
                  <button type="submit" form={ANSWER_FORM_ID} className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
                    Check
                  </button>
                ) : sessionWillComplete ? (
                  <Link href="/student/mastery" className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
                    See my progress
                  </Link>
                ) : (
                  <button type="button" onClick={nextQuestion} className={buttonClasses("focus", "lg", "animate-pop w-full sm:w-72")}>
                    Next question
                  </button>
                )}
              </div>
            </div>

            {/* Quiet help row: the hint ladder stays collapsed until the student explicitly asks.
                -mt-3 trims the space-y-6 gap above (card -> help row) so this reads closer to the
                answer-mode toggle's quiet-link family, without touching the gap-6 the card itself
                keeps around the feedback region and the Check/Next button. */}
            <div className="-mt-3 flex flex-wrap items-center gap-5 empty:hidden">
              {showMissed && !hintOpen && (
                <button
                  type="button"
                  onClick={() => setHintOpen(true)}
                  className="text-sm font-medium text-focus underline-offset-4 hover:underline"
                >
                  Stuck? Get a hint
                </button>
              )}
            </div>

            {hintOpen && (
              <div className="animate-rise">
                <HintLadder activeLevel={activeHint} hint={hintText} loading={hintLoading} onRequest={requestHint} embedded />
              </div>
            )}

            {showWorkHelp && workHelpSupportLevel && (
              <div className="animate-rise">
                <WorkHelpCard
                  studentId={canonicalDemoIds.mayaStudentId}
                  itemId={current.itemId}
                  supportLevel={workHelpSupportLevel}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </StudentShell>
  );
}
