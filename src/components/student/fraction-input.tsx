"use client";

// Structured numerator/denominator entry, stacked to match the <Fraction> display so the answer
// visually mirrors the question. Composes the same plain answer string the old plain-text
// AnswerInput produced and calls the identical onSubmit(answer: string) contract, so scoreAnswer
// and everything downstream of it works completely unchanged.
import { useId, useState } from "react";
import { buttonClasses, cn } from "@/components/ui";

export function FractionInput({
  onSubmit,
  disabled = false,
  label = "Your answer",
  formId,
  showSubmit = true,
  className,
}: {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  label?: string;
  /** Lets an external button drive submission via the `form` attribute (used with showSubmit=false). */
  formId?: string;
  /** Hide the built-in Check button when the surrounding layout renders its own action button. */
  showSubmit?: boolean;
  className?: string;
}) {
  const [numerator, setNumerator] = useState("");
  const [denominator, setDenominator] = useState("");
  const numeratorId = useId();
  const denominatorId = useId();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const num = numerator.trim();
    const den = denominator.trim();
    if (!num) return;
    // Same composed shape scoreAnswer already expects: "num/den", or just "num" for whole-number
    // answers (e.g. "what common denominator..." questions), matching the plain AnswerInput's output.
    onSubmit(den ? `${num}/${den}` : num);
  }

  const fieldClasses = cn(
    "w-24 rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-xl font-bold text-ink",
    "placeholder:font-normal placeholder:text-ink-faint",
    "disabled:bg-surface disabled:text-ink-faint",
  );

  return (
    // Left-anchored cluster: the stacked input and the Check button sit together (never split to
    // opposite edges), with the helper hint tucked underneath. Reads as one tidy control group.
    // Pass className="items-center text-center" (+ showSubmit={false}) for centered card layouts.
    <form id={formId} className={cn("flex flex-col gap-3", className)} onSubmit={submit}>
      <div className="flex items-center gap-5">
        <fieldset
          disabled={disabled}
          className="flex items-center gap-4"
          // Explicit Enter-to-submit: with the visible action button potentially outside the form
          // (showSubmit=false), implicit submission is browser-dependent — this makes it certain.
          onKeyDown={(event) => {
            if (event.key !== "Enter" || disabled) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        >
          <legend className="sr-only">{label}</legend>
          <div className="flex flex-col items-center gap-1">
            <label className="sr-only" htmlFor={numeratorId}>
              Numerator
            </label>
            <input
              id={numeratorId}
              inputMode="numeric"
              autoComplete="off"
              value={numerator}
              onChange={(event) => setNumerator(event.target.value)}
              placeholder="7"
              className={fieldClasses}
            />
            <span aria-hidden="true" className="block h-[2px] w-full bg-ink" />
            <label className="sr-only" htmlFor={denominatorId}>
              Denominator
            </label>
            <input
              id={denominatorId}
              inputMode="numeric"
              autoComplete="off"
              value={denominator}
              onChange={(event) => setDenominator(event.target.value)}
              placeholder="12"
              className={fieldClasses}
            />
          </div>
        </fieldset>
        {showSubmit && (
          <button type="submit" disabled={disabled || !numerator.trim()} className={buttonClasses("focus", "lg", "px-8")}>
            Check
          </button>
        )}
      </div>
      {/* With the visible action button rendered outside the form (via the form attribute), this
          invisible in-form submit button keeps Enter-to-submit working in every browser. */}
      {!showSubmit && <button type="submit" hidden tabIndex={-1} aria-hidden="true" />}
      <p className="text-sm text-ink-muted">Just one number? Leave the bottom box blank.</p>
    </form>
  );
}
