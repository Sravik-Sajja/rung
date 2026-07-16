"use client";

// Tutor support rendered as an actual ladder — three ascending rungs of help, smallest first.
import { Card, Eyebrow, cn } from "@/components/ui";

export type HintLevel = "nudge" | "hint" | "guided_step";

const rungs: Array<{ level: HintLevel; step: string; label: string; description: string }> = [
  { level: "nudge", step: "01", label: "Nudge", description: "A question to point you back at the problem." },
  { level: "hint", step: "02", label: "Hint", description: "One specific piece of the method." },
  { level: "guided_step", step: "03", label: "Guided step", description: "One next actionable step, never the completed solution." },
];

export function HintLadder({
  activeLevel,
  hint,
  onRequest,
  loading = false,
  embedded = false,
}: {
  activeLevel?: HintLevel;
  hint?: string;
  onRequest: (level: HintLevel) => void;
  loading?: boolean;
  /** Renders without the outer Card chrome and a slimmer header, for use inside another
   *  surface's own disclosure panel (e.g. the persisted practice loop's focal card). Default
   *  false keeps the original standalone appearance unchanged. */
  embedded?: boolean;
}) {
  const body = (
    <>
      {embedded ? (
        <p className="text-sm text-ink-muted">Try the smallest rung first: each one gives a little more away.</p>
      ) : (
        <>
          <Eyebrow className="mb-1">Tutor support</Eyebrow>
          <h2 className="text-xl font-bold tracking-tight text-ink">Need a hand?</h2>
          <p className="mt-1 text-sm text-ink-muted">Try the smallest rung first: each one gives a little more away.</p>
        </>
      )}

      <ol className={cn("space-y-2.5", embedded ? "mt-3" : "mt-5")}>
        {rungs.map(({ level, step, label, description }) => {
          const active = activeLevel === level;
          return (
            <li key={level}>
              <button
                type="button"
                disabled={loading}
                onClick={() => onRequest(level)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-4 rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-50",
                  // Blue marks "currently selected rung" — green is reserved for correctness/mastery.
                  active ? "border-focus bg-focus-soft" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold",
                    active ? "bg-focus text-focus-contrast" : "bg-surface-2 text-ink-faint",
                  )}
                >
                  {step}
                </span>
                <span className="flex-1">
                  <span className={cn("block text-base font-semibold", active ? "text-focus" : "text-ink")}>
                    {label}
                  </span>
                  <span className="block text-sm text-ink-muted">{description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {hint && (
        // Revealed content gets a step of elevation above the card it lives in (bg-elevated +
        // shadow-sm) and rises in, so a new hint reads as something that just appeared, not
        // static copy that was always there.
        <div className="animate-rise mt-4 rounded-md border border-border bg-elevated p-4 shadow-sm" role="status">
          <p className="text-xs font-semibold text-ink-faint">
            {activeLevel ? rungs.find((rung) => rung.level === activeLevel)?.label : "Tutor"}
          </p>
          <p className="mt-1 text-ink">{hint}</p>
        </div>
      )}
    </>
  );

  return (
    <section aria-label="Tutor hints">
      {embedded ? body : <Card className="p-6">{body}</Card>}
    </section>
  );
}
