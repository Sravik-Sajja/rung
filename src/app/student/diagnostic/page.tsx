"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentShell } from "@/components/student/surface/student-shell";
import { RungProgress } from "@/components/student/surface/rung-progress";
import { FractionExpression } from "@/components/student/fraction";
import { NumberLineQuestion } from "@/components/student/number-line-question";
import { FractionInput, answerModeForSubskill, type FractionInputHandle } from "@/components/student/fraction-input";
import { Eyebrow, buttonClasses } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import type { ItemVisualSpec } from "@/lib/types";

type DiagnosticItem = { id: string; prompt: string; subskillId: string; visualSpec?: ItemVisualSpec; position: number };
type Diagnostic = { diagnosticSessionId: string; assignmentId: string; items: DiagnosticItem[] };

// One short hint per subskill. Kept intentionally light — a nudge toward the method, never the
// answer — since a diagnostic measures where the student is, and any hint they lean on flags that
// subskill for extra reps in the follow-up practice set.
const hintsBySubskill: Record<string, string> = {
  "equivalent-fractions": "Multiply the top and bottom by the same number: the value stays the same.",
  "fraction-number-line": "Split the line from 0 to 1 into equal parts that match the denominator, then count up.",
  "find-common-denominator": "Look for a number that both denominators divide into evenly.",
  "add-unlike-denominators": "Rewrite both fractions over a common denominator first, then add just the numerators.",
  "subtract-unlike-denominators": "Rewrite both fractions over a common denominator first, then subtract just the numerators.",
};
const fallbackHint = "Think about what the denominators are telling you before you combine the fractions.";

// The external action button submits the FractionInput's form via the `form` attribute, so
// Check and Next can morph in one fixed position at the bottom of the card.
const ANSWER_FORM_ID = "diagnostic-answer-form";

// Decorative ladder rungs for the side margins on very wide screens: the climb motif makes the
// quiet space beside the centered column read as designed, not empty. Bottom rung is the most
// solid (where you start), fading as the ladder climbs. Purely visual — aria-hidden.
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
        <span
          key={index}
          className="h-1 w-12 rounded-full bg-border-strong 2xl:w-16"
          style={{ opacity }}
        />
      ))}
    </div>
  );
}

function DiagnosticContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The server still verifies this against the opaque demo cookie; the query
  // merely preserves the selected learner across the visible walkthrough.
  const studentId = searchParams.get("studentId");
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  // The framing copy earns its display size exactly once — as an intro step — instead of sitting
  // beside every question as a permanent second focal point.
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [recorded, setRecorded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Item ids the student revealed a hint on — sent with the answer so completion can add extra
  // practice for those subskills. Persists across questions; the current item's flag is derived below.
  const [hintedItems, setHintedItems] = useState<Set<string>>(new Set());
  const answerRef = useRef<FractionInputHandle>(null);

  useEffect(() => {
    if (!studentId) {
      router.replace("/demo");
      return;
    }
    fetch(`/api/diagnostics/${canonicalDemoIds.diagnosticAssignmentId}?studentId=${encodeURIComponent(studentId)}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setDiagnostic)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not start diagnostic"));
  }, [router, studentId]);

  const item = diagnostic?.items[index];
  const total = diagnostic?.items.length ?? 0;
  const isLastItem = Boolean(diagnostic && index === total - 1);
  const hintUsed = Boolean(item && hintedItems.has(item.id));
  const hintText = item ? hintsBySubskill[item.subskillId] ?? fallbackHint : "";

  function revealHint() {
    if (!item) return;
    setHintedItems((current) => new Set(current).add(item.id));
  }

  async function handleSubmit(answer: string) {
    if (!diagnostic || !item || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, diagnosticSessionId: diagnostic.diagnosticSessionId, itemId: item.id, answer, context: "diagnostic", usedHint: hintedItems.has(item.id) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not record answer");
        return;
      }
      setRecorded(true);
    } catch {
      setError("Rung could not reach the local server. Restart npm run dev, then refresh to begin a new diagnostic.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (!diagnostic) return;
    if (isLastItem) {
      router.push(`/student/diagnosis?diagnosticSessionId=${encodeURIComponent(diagnostic.diagnosticSessionId)}&studentId=${encodeURIComponent(studentId!)}`);
      return;
    }
    setIndex((current) => current + 1);
    setRecorded(false);
  }

  return (
    <StudentShell size="wide">
      {/* One centered reading column — a single focal plane, like every one-question-at-a-time
          flow. The wide shell keeps the header/footer chrome spanning the viewport as an anchor,
          and the space beside the column is treated (glow + rung motif) so it reads as designed
          quiet rather than void. */}
      <section className="relative flex flex-1 items-center justify-center">
        {/* Soft spark-gold pool of light behind the card so the focal object sits in a lit spot
            on the canvas instead of floating on one flat wash. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-full max-w-[52rem] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--spark-soft), transparent)" }}
        />
        <RungMotif side="left" />
        <RungMotif side="right" />

        <div className="relative mx-auto w-full max-w-3xl py-8">
          {!started && (
            // Intro step: the reassurance framing gets the stage to itself once, then hands the
            // screen over to the questions.
            <div className="animate-rise flex flex-col items-center text-center">
              <Eyebrow className="mb-3">Fractions check-in</Eyebrow>
              <h1 className="text-balance text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                Let&rsquo;s find your starting rung.
              </h1>
              <p className="mt-4 max-w-md text-pretty text-ink-muted sm:text-lg">
                A few quick questions, no grade, no wrong way to start. Rung just uses them to
                point you at the practice that will help the most.
              </p>
              <button
                type="button"
                onClick={() => setStarted(true)}
                className={buttonClasses("focus", "lg", "mt-8 px-10")}
              >
                Start the check-in
              </button>
              {error && <p className="mt-4 text-sm text-danger">{error}</p>}
            </div>
          )}

          {started && !diagnostic && (
            error
              ? <p className="text-center text-ink-muted">{error}</p>
              // Skeleton keeps the layout stable (no jump when questions arrive) and reads as
              // "working" rather than bare text stranded in empty space.
              : <div aria-hidden="true" className="animate-pulse space-y-4 rounded-2xl border border-border bg-surface p-8 shadow-md">
                  <div className="mx-auto h-10 w-3/4 rounded bg-surface-2" />
                  <div className="h-px w-full bg-border" />
                  <div className="mx-auto h-12 w-1/2 rounded bg-surface-2" />
                </div>
          )}

          {started && diagnostic && item && (
            <div className="space-y-6">
              <h1 className="sr-only">Fractions check-in</h1>
              {/* The branded rung ladder counts the question you're on (1 of 5, never 0 of 5) and
                  fills a rung gold as you climb — the metaphor made visible on screen. */}
              <RungProgress current={index + 1} total={total} label="Question" />

              {/* One elevated card is the single focal point. Top-to-bottom reading order only:
                  question, answer, help, action — no horizontal eye travel. */}
              <div key={item.id} className="animate-rise rounded-2xl border border-border bg-elevated shadow-lg">
                {/* Question zone */}
                <div className="flex flex-col items-center justify-center gap-6 p-8 text-center sm:p-10 2xl:p-14">
                  <FractionExpression text={item.prompt} size="lg" className="justify-center 2xl:text-4xl" />
                  {item.visualSpec?.kind === "number_line" && <NumberLineQuestion visualSpec={item.visualSpec} />}
                </div>
                {/* Answer zone: inputs mirror the stacked fraction in the prompt, the hint stays a
                    quiet text affordance until asked for, and one primary button holds the bottom
                    slot — Save morphs into Next in place once the answer is recorded. The label is
                    "Save answer", not "Check": a diagnostic records the answer and never reveals
                    correctness, so promising a check would be a lie. Practice, which does score
                    immediately, keeps its own "Check" button. */}
                <div className="flex flex-col items-center gap-6 border-t border-border p-8 sm:p-10 2xl:p-12">
                  <FractionInput
                    key={item.id}
                    ref={answerRef}
                    formId={ANSWER_FORM_ID}
                    showSubmit={false}
                    label={`Your answer to ${item.prompt}`}
                    disabled={recorded}
                    onSubmit={handleSubmit}
                    className="items-center text-center"
                    defaultMode={answerModeForSubskill(item.subskillId)}
                  />

                  {hintUsed ? (
                    // Blue is the support signal in this system (green stays "correct"). The note
                    // flags the consequence honestly: this kind of question comes back afterward.
                    // A margin annotation, not an alert box: a thin blue rail carries the hint
                    // instead of a tinted, bordered panel. -mt-3 pulls this up against the
                    // answer-mode toggle inside FractionInput so the two quiet-link affordances
                    // read as one grouped cluster, without touching the gap-6 the parent column
                    // keeps below (toward the feedback/action region).
                    <div className="animate-rise -mt-3 w-full border-l-2 border-focus pl-4 text-left">
                      <p className="text-sm font-semibold text-focus">Hint</p>
                      <p className="mt-1 text-ink">{hintText}</p>
                      <p className="mt-2 text-sm text-ink-muted">You&rsquo;ll get extra practice on this kind of question.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={revealHint}
                      disabled={recorded}
                      className="-mt-3 text-sm font-medium text-focus underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
                    >
                      Stuck? Show a hint
                    </button>
                  )}

                  <div aria-live="polite" className="flex w-full flex-col items-center gap-3 empty:hidden">
                    {recorded && (
                      // Momentum-gold, not correct-green: a diagnostic saves your thinking, it
                      // doesn't grade it. Gold says "logged, keep moving" without implying
                      // right/wrong. An inline acknowledgment, not a pill: no border or fill, just
                      // a small glyph beside the text. text-spark-ink (not text-spark) carries both
                      // the icon and the copy since it's the token with safe contrast on the
                      // elevated card in both themes.
                      <p className="animate-pop inline-flex items-center gap-2 text-sm font-medium text-spark-ink">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          className="h-4 w-4 shrink-0 fill-current"
                        >
                          <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4L8 11.6l6.8-6.8a1 1 0 0 1 1.4 0Z" />
                        </svg>
                        Got it. Your answer is saved.
                      </p>
                    )}
                    {error && <p className="text-sm text-danger">{error}</p>}
                  </div>

                  {!recorded ? (
                    <button
                      type="submit"
                      form={ANSWER_FORM_ID}
                      disabled={submitting}
                      className={buttonClasses("focus", "lg", "w-full sm:w-72")}
                    >
                      Save answer
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNext}
                      className={buttonClasses("focus", "lg", "animate-pop w-full sm:w-72")}
                    >
                      {isLastItem ? "See my results" : "Next question"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </StudentShell>
  );
}

export default function DiagnosticPage() {
  return <Suspense fallback={<StudentShell size="wide"><section className="flex flex-1 items-center justify-center"><p className="text-ink-muted">Loading your check-in…</p></section></StudentShell>}><DiagnosticContent /></Suspense>;
}
