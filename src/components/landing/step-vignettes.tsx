// Miniature, non-interactive mocks of the real product UI, one per student-loop step. These
// illustrate the copy in "How it works" ("show, don't tell") — they reuse the same design
// tokens as the live surfaces (HintLadder, PeerGateCard, RungProgress, MasteryBadge) so the
// promise reads as the actual product, not a generic icon. Server-rendered, static, aria-hidden.
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

function VignetteFrame({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none w-full max-w-[16rem] rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      {children}
    </div>
  );
}

// 01 — Diagnostic: a single calibrated question with two empty answer slots and a check action.
function DiagnosticVignette() {
  return (
    <>
      <p className="text-xs font-bold text-ink">Write a fraction equivalent to ½&hellip;</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-col gap-1">
          <span className="h-6 w-12 rounded border border-border bg-surface-2" />
          <span className="h-6 w-12 rounded border border-border bg-surface-2" />
        </div>
        <span className="rounded bg-focus px-2 py-0.5 text-xs font-semibold text-focus-contrast">Check</span>
      </div>
    </>
  );
}

// 02 — Sub-skill diagnosis: broad, ruled-out skills narrowing to the one named gap.
function SubSkillVignette() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-faint line-through">fractions</span>
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-faint line-through">equivalent fractions</span>
      <span aria-hidden="true" className="text-ink-faint">
        &rarr;
      </span>
      <span className="rounded-full border border-focus bg-focus-soft px-2 py-0.5 font-semibold text-focus">
        common denominators
      </span>
    </div>
  );
}

// 03 — Targeted practice: the same rung-progress language as the live student surface.
const PRACTICE_SEGMENTS = ["bg-accent", "bg-accent", "bg-spark", "bg-surface-2", "bg-surface-2"];

function PracticeVignette() {
  return (
    <div>
      <div className="flex gap-1" role="presentation">
        {PRACTICE_SEGMENTS.map((toneClass, index) => (
          <span key={index} aria-hidden="true" className={cn("h-1.5 flex-1 rounded-full", toneClass)} />
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">Question 3 of 5</p>
    </div>
  );
}

// 04 — AI tutor hint ladder: mirrors HintLadder's selected-rung treatment (blue = active rung).
const HINT_ROWS: Array<{ label: string; active: boolean }> = [
  { label: "Nudge", active: true },
  { label: "Hint", active: false },
  { label: "Guided step", active: false }
];

function HintLadderVignette() {
  return (
    <div className="space-y-1.5">
      {HINT_ROWS.map((row) => (
        <div
          key={row.label}
          className={cn(
            "rounded border px-2 py-1 text-xs",
            row.active ? "border-focus bg-focus-soft font-semibold text-focus" : "border-border bg-surface-2 text-ink-muted"
          )}
        >
          {row.label}
        </div>
      ))}
    </div>
  );
}

// Tiny lock glyph for the gated tile below — no emoji, a plain inline SVG path.
function LockGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-ink-faint">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

// 05 — Attempt-gated peer example: first step unlocked, full solution still locked.
function PeerGateVignette() {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 rounded-md border border-border-strong bg-elevated px-2.5 py-1.5">
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink">Unlocked</span>
        <span className="text-xs text-ink">Peer&rsquo;s first step</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5">
        <LockGlyph />
        <span className="text-xs text-ink-faint">Full solution</span>
        <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
          Locked
        </span>
      </div>
    </div>
  );
}

// 06 — Mastery: three lower levels resolving into the mastered cell, the loop's payoff.
const MASTERY_CELLS = ["bg-mastery-developing", "bg-mastery-support", "bg-mastery-none"];

function MasteryVignette() {
  return (
    <div>
      <div className="flex items-end gap-1.5">
        {MASTERY_CELLS.map((toneClass, index) => (
          <span key={index} aria-hidden="true" className={cn("h-5 w-5 rounded-sm", toneClass)} />
        ))}
        <span aria-hidden="true" className="h-6 w-6 rounded-sm bg-mastery-mastered ring-2 ring-accent" />
      </div>
      <span className="mt-2 inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
        Mastered
      </span>
    </div>
  );
}

const VIGNETTES: Record<string, () => ReactNode> = {
  "01": DiagnosticVignette,
  "02": SubSkillVignette,
  "03": PracticeVignette,
  "04": HintLadderVignette,
  "05": PeerGateVignette,
  "06": MasteryVignette
};

/** Renders the small product mock for a given step number ("01".."06"), framed consistently. */
export function StepVignette({ n }: { n: string }) {
  const Inner = VIGNETTES[n];
  if (!Inner) return null;
  return (
    <VignetteFrame>
      <Inner />
    </VignetteFrame>
  );
}
