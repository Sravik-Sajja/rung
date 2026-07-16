// Stacked fraction display — numerator over a rule over denominator, the way students actually
// read fractions on paper. Never rendered as an inline "n/d" string, which reads as division to a
// student who is still building the concept. Visual only: this component has no opinion about
// correctness or scoring.
import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function Fraction({
  numerator,
  denominator,
  size = "md",
  className,
}: {
  numerator: string | number;
  denominator: string | number;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${numerator}/${denominator}`}
      className={cn("mx-0.5 inline-flex flex-col items-center align-middle leading-none", className)}
    >
      <span
        aria-hidden="true"
        className={cn("px-1 pb-1 font-bold tabular-nums text-ink", size === "lg" ? "text-2xl sm:text-3xl" : "text-lg")}
      >
        {numerator}
      </span>
      <span aria-hidden="true" className={cn("block w-full bg-ink", size === "lg" ? "h-[3px]" : "h-[2px]")} />
      <span
        aria-hidden="true"
        className={cn("px-1 pt-1 font-bold tabular-nums text-ink", size === "lg" ? "text-2xl sm:text-3xl" : "text-lg")}
      >
        {denominator}
      </span>
    </span>
  );
}

const FRACTION_PATTERN = /(\d+\/\d+)/g;

/**
 * Splits a prompt string like "What is 1/3 + 1/4?" into plain-text and stacked-<Fraction> nodes,
 * so any operator or wording already in the prompt (the "+" between two fractions, "with
 * denominator 8", etc.) renders inline exactly as authored while every literal n/d pair renders
 * stacked. Purely presentational — the underlying prompt string used for scoring never changes.
 */
function renderFractionPrompt(text: string, size: "md" | "lg"): ReactNode[] {
  return text.split(FRACTION_PATTERN).map((part, index) => {
    if (/^\d+\/\d+$/.test(part)) {
      const [numerator, denominator] = part.split("/");
      return <Fraction key={index} numerator={numerator} denominator={denominator} size={size} />;
    }
    // Text stays in the same inline formatting context as its adjacent
    // fraction. The old span + flex-token layout allowed punctuation such as
    // a leading comma to be orphaned on its own line.
    return part || null;
  });
}

/** Renders a full math prompt with any embedded fractions stacked, big and legible. */
export function FractionExpression({
  text,
  size = "lg",
  className,
}: {
  text: string;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline font-bold tracking-tight text-ink leading-[1.35]",
        size === "lg" ? "text-2xl sm:text-3xl" : "text-lg",
        className,
      )}
    >
      {renderFractionPrompt(text, size)}
    </span>
  );
}
