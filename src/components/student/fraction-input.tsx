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
}: {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  label?: string;
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
    <form className="flex flex-col gap-4 sm:flex-row sm:items-center" onSubmit={submit}>
      <fieldset disabled={disabled} className="flex items-start gap-3">
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
        <p className="max-w-[9rem] pt-1 text-xs text-ink-faint">Just one number? Leave the bottom box blank.</p>
      </fieldset>
      <button type="submit" disabled={disabled || !numerator.trim()} className={buttonClasses("focus", "lg")}>
        Check
      </button>
    </form>
  );
}
