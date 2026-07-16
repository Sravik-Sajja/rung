"use client";

// Shared subdivision control for fraction models (bars, circles, sets). Kept as a single
// stepper so every model surface changes parts count the same way, with the same clamps
// and the same screen-reader announcement.
import { MIN_PARTS, MAX_PARTS } from "./model-math";
import { cn } from "@/components/ui";

export function PartsStepper({
  parts,
  onChange,
  disabled,
  label,
}: {
  parts: number;
  onChange: (parts: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const canDecrease = !disabled && parts > MIN_PARTS;
  const canIncrease = !disabled && parts < MAX_PARTS;

  return (
    <div className="flex items-center gap-3">
      {label ? <span className="text-sm text-ink-muted">{label}</span> : null}
      <button
        type="button"
        aria-label="Fewer parts"
        disabled={!canDecrease}
        onClick={() => onChange(Math.max(MIN_PARTS, parts - 1))}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-lg font-semibold text-ink hover:border-border-strong disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        −
      </button>
      <span aria-live="polite" className="min-w-[5rem] text-center text-sm font-medium text-ink">
        {parts} parts
      </span>
      <button
        type="button"
        aria-label="More parts"
        disabled={!canIncrease}
        onClick={() => onChange(Math.min(MAX_PARTS, parts + 1))}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-lg font-semibold text-ink hover:border-border-strong disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        +
      </button>
    </div>
  );
}
