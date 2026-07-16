"use client";

// Orchestrates one practice item: answer submission, the hint ladder, and the peer-gated
// worked example. Kept as a client component so the server route can stay an async page.
//
// Progressive disclosure: only the question + answer + a single "Need a hint?" affordance are
// visible by default. The hint ladder and the peer-approach form are collapsed behind their own
// controls and only mount once the student asks for them, so the screen never dumps every layer
// of help on top of the question at once.
import { useState } from "react";
import Link from "next/link";
import type { Item } from "@/lib/types";
import { demoSubskills } from "@/lib/demo-data";
import { scoreAnswer } from "@/lib/math/scoring";
import { Card, Eyebrow, buttonClasses, cn } from "@/components/ui";
import { StudentShell } from "./surface/student-shell";
import { RungProgress } from "./surface/rung-progress";
import { StreakChip } from "./surface/streak-chip";
import { FractionExpression } from "./fraction";
import { FractionInput } from "./fraction-input";
import { HintLadder, type HintLevel } from "./hint-ladder";
import { PeerGateCard } from "./peer-gate-card";

const hintCopy: Record<HintLevel, string> = {
  nudge: "Look at the two denominators before you add: are they the same?",
  hint: "Rewrite each fraction using a common denominator of 12.",
  guided_step: "Try using 12 as the common denominator. Rewrite both fractions over 12, then add the numerators. What fraction do you get?",
};

export function PracticeSession({ sessionId, items }: { sessionId: string; items: Item[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  // Real session state, not a fabricated number: increments on each correct submission this
  // session and resets on a miss, so the chip only ever reflects what actually happened.
  const [streak, setStreak] = useState(0);
  const [activeHintLevel, setActiveHintLevel] = useState<HintLevel | undefined>();
  const [approachUnlocked, setApproachUnlocked] = useState(false);
  // Both start closed every item — earned layers, not defaults.
  const [hintOpen, setHintOpen] = useState(false);
  const [peerOpen, setPeerOpen] = useState(false);

  const item = items[currentIndex];
  const subskill = demoSubskills.find((candidate) => candidate.id === item.subskillId);
  const isCorrect = submittedAnswer !== null && scoreAnswer(item, submittedAnswer);
  const hasMissed = submittedAnswer !== null && !isCorrect;
  const isLastItem = currentIndex === items.length - 1;

  function handleAnswerSubmit(answer: string) {
    setSubmittedAnswer(answer);
    const correct = scoreAnswer(item, answer);
    setStreak((current) => (correct ? current + 1 : 0));
  }

  function tryAgain() {
    setSubmittedAnswer(null);
  }

  function nextItem() {
    setCurrentIndex((current) => current + 1);
    setSubmittedAnswer(null);
    setActiveHintLevel(undefined);
    setApproachUnlocked(false);
    setHintOpen(false);
    setPeerOpen(false);
  }

  return (
    <StudentShell aside={<StreakChip count={streak} />}>
      <section className="flex-1 space-y-8">
        <div className="animate-rise">
          <Eyebrow className="mb-2">Practice</Eyebrow>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Common denominators</h1>
          <p className="mt-3 text-ink-muted">
            Session {sessionId}: work through the item below, and use a hint only if you get stuck.
          </p>
        </div>

        {/* Keyed on the item so the bar rises in fresh each question instead of just recoloring. */}
        <div key={currentIndex} className="animate-rise">
          <RungProgress current={currentIndex + 1} total={items.length} label="Rung" />
        </div>

        {/* The math prompt is the hero of this screen — bg-elevated + shadow-lg lifts it a full
            step above the bg-bg canvas so it visibly floats, with a bigger, bolder number. Only
            the prompt, the answer, and one subtle hint affordance are visible by default. */}
        <Card key={item.id} className="animate-rise space-y-5 border-border-strong bg-elevated p-6 shadow-lg sm:p-8">
          {subskill && (
            <span className="font-mono text-xs uppercase tracking-wider text-ink-faint">{subskill.name}</span>
          )}

          <FractionExpression text={item.prompt} />

          <FractionInput
            key={item.id}
            label={`Your answer to ${item.prompt}`}
            disabled={submittedAnswer !== null}
            onSubmit={handleAnswerSubmit}
          />

          {isCorrect && (
            // Result and the next action live side by side — the student never has to scroll past
            // the hint ladder or the peer form to find how to move on.
            <div className="animate-pop flex flex-wrap items-center justify-between gap-4 rounded-md border border-accent bg-accent-soft p-4 shadow-md">
              <p className="flex items-center gap-2 text-lg font-bold text-accent">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-current">
                  <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                </svg>
                Correct!
              </p>
              {isLastItem ? (
                <Link href="/student/mastery" className={buttonClasses("focus", "lg")}>
                  See my progress
                </Link>
              ) : (
                <button type="button" onClick={nextItem} className={buttonClasses("focus", "lg")}>
                  Next question
                </button>
              )}
            </div>
          )}

          {hasMissed && (
            <div className="rounded-md border border-border bg-surface-2 p-4" role="status">
              <p className="font-semibold text-ink">Not yet, you&apos;ve got this.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={tryAgain} className={buttonClasses("secondary", "md")}>
                  Try again
                </button>
              </div>
            </div>
          )}

          {!isCorrect && (
            <button
              type="button"
              onClick={() => setHintOpen((open) => !open)}
              aria-expanded={hintOpen}
              className="text-sm font-semibold text-ink-muted underline decoration-dotted underline-offset-4 hover:text-ink"
            >
              {hintOpen ? "Hide hint" : "Need a hint?"}
            </button>
          )}
        </Card>

        {hintOpen && !isCorrect && (
          <div className="animate-rise">
            <HintLadder
              activeLevel={activeHintLevel}
              hint={activeHintLevel ? hintCopy[activeHintLevel] : undefined}
              onRequest={setActiveHintLevel}
            />
          </div>
        )}

        {/* Peer worked-example: collapsed behind a single control. The attempt form (and its photo
            uploader) only mounts once the student opens it — never shown upfront. */}
        {peerOpen ? (
          <div className="animate-rise">
            <PeerGateCard
              approachUnlocked={approachUnlocked}
              fullSolutionUnlocked={isCorrect}
              onSubmitAttempt={() => setApproachUnlocked(true)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPeerOpen(true)}
            className={cn(buttonClasses("secondary", "md"), "w-full justify-start sm:w-auto")}
          >
            Stuck? See how a peer approached it
          </button>
        )}
      </section>
    </StudentShell>
  );
}
