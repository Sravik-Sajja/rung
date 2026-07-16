"use client";

// Shared "you marked n/d" readout for fraction models. Centralizing this keeps the
// stacked-fraction rendering and the "use as my answer" hand-off identical across
// every model surface instead of each one re-deriving the fraction string.
import { formatFraction } from "./model-math";
import { Fraction } from "@/components/student/fraction";

export function ModelReadout({
  lead,
  numerator,
  denominator,
  onUse,
  disabled,
}: {
  lead: string;
  numerator: number;
  denominator: number;
  onUse?: (answer: string) => void;
  disabled?: boolean;
}) {
  return (
    <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm text-ink">
      <span>{lead}</span>
      <Fraction numerator={numerator} denominator={denominator} size="md" />
      <button
        type="button"
        disabled={disabled || !onUse}
        onClick={() => onUse?.(formatFraction(numerator, denominator))}
        className="text-sm font-medium text-focus underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
      >
        Use as my answer
      </button>
    </div>
  );
}
