"use client";

import { useState } from "react";
import { Badge, Card, Eyebrow, buttonClasses, cn } from "@/components/ui";

// Attempt-gated worked example: a peer's first step unlocks after a genuine attempt, the
// full solution stays locked until the student answers correctly. Framed as worked-example
// learning, never as answer sharing.
export function PeerGateCard({
  approachUnlocked,
  fullSolutionUnlocked,
  onSubmitAttempt,
  approachText = "Rewrite each fraction with a denominator of 12, then add the numerators.",
  fullSolutionText = "1/3 = 4/12 and 1/4 = 3/12, so 4/12 + 3/12 = 7/12.",
}: {
  approachUnlocked: boolean;
  fullSolutionUnlocked: boolean;
  onSubmitAttempt: (attempt: { attemptText: string; photo: File | null }) => void;
  approachText?: string;
  fullSolutionText?: string;
}) {
  const [attemptText, setAttemptText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  // Until the server-side image-analysis route is wired, typed work remains the
  // required, verifiable evidence. A photo is an optional supplement.
  const canSubmit = Boolean(attemptText.trim());

  return (
    <Card className="p-6" aria-labelledby="peer-gate-title">
      <Eyebrow className="mb-1">Worked-example learning, not answer sharing</Eyebrow>
      <h2 id="peer-gate-title" className="text-xl font-bold tracking-tight text-ink">
        See a peer&apos;s approach
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Show your work or explain your first step. A peer&apos;s first step unlocks after a meaningful attempt.
      </p>

      {!approachUnlocked && (
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-semibold text-ink" htmlFor="peer-gate-attempt">
            Show your work or explain your first step
          </label>
          <textarea
            id="peer-gate-attempt"
            value={attemptText}
            onChange={(event) => setAttemptText(event.target.value)}
            className="min-h-20 w-full rounded-md border border-border bg-surface-2 p-3 text-ink placeholder:text-ink-faint"
            placeholder="For example: What common denominator did you try, or how did you rewrite the fractions?"
          />
          <div className="rounded-md border border-dashed border-border p-3">
            <label className="block cursor-pointer text-sm font-semibold text-ink" htmlFor="peer-gate-photo">
              Add a photo of your work <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <p className="mt-1 text-sm text-ink-muted">Use a clear photo of handwritten work to support your written explanation.</p>
            <input
              id="peer-gate-photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              className="mt-3 block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-semibold file:text-ink hover:file:bg-border"
            />
            {photo && (
              <div className="mt-2 flex items-center justify-between gap-3 text-sm text-ink">
                <span className="truncate">Attached: {photo.name}</span>
                <button type="button" onClick={() => setPhoto(null)} className="text-accent underline">
                  Remove
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmitAttempt({ attemptText: attemptText.trim(), photo })}
            className={buttonClasses("focus", "md")}
          >
            Check my attempt
          </button>
        </div>
      )}

      {approachUnlocked && (
        <div className="mt-4 space-y-3">
          {/* First unlock: a genuine attempt was made — a neutral reveal, not a correctness signal.
              Rises in and steps up to bg-elevated so it reads as newly revealed content, not a box
              that was always sitting there. */}
          <div className="animate-rise rounded-md border border-border-strong bg-elevated p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Badge tone="neutral">Unlocked</Badge>
              <span className="text-xs font-semibold text-ink-faint">Peer&apos;s first step</span>
            </div>
            <p className="text-ink">{approachText}</p>
          </div>

          {/* Second unlock is gated directly on scoreAnswer correctness, so it gets the "you got it
              right" green treatment — never gold, which is reserved for streak/reward moments. */}
          <div
            className={cn(
              "rounded-md border p-4",
              fullSolutionUnlocked
                ? "animate-pop border-accent bg-accent-soft shadow-lg"
                : "border-border bg-surface-2",
            )}
          >
            <div className="mb-1 flex items-center gap-2">
              <Badge tone={fullSolutionUnlocked ? "mastered" : "neutral"}>
                {fullSolutionUnlocked ? "Unlocked" : "Locked"}
              </Badge>
              <span className="text-xs font-semibold text-ink-faint">Full worked solution</span>
            </div>
            <p className={cn(fullSolutionUnlocked ? "font-semibold text-accent" : "text-ink")}>
              {fullSolutionUnlocked ? fullSolutionText : "Unlocks once you solve the problem correctly."}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
