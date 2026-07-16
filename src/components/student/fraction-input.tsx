"use client";

// Structured answer entry that renders either a stacked numerator/denominator (mirroring the
// <Fraction> display) or a single whole-number field. Which shape it starts on is decided by
// `defaultMode` (see `answerModeForSubskill` below); a quiet text link lets the student switch
// shape themselves if the default guessed wrong. Either way it composes the same plain string the
// scoreAnswer contract already expects ("num/den" or just "num"), so everything downstream works
// unchanged.
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { buttonClasses, cn } from "@/components/ui";

export type AnswerMode = "fraction" | "whole";

// Imperative escape hatch for the deliberately-uncontrolled input: callers (e.g. "Use as my
// answer" from work-help) need to push a one-shot value in without turning this into a
// controlled component, the same way form.requestSubmit() is used for one-shot submission.
export interface FractionInputHandle {
  setAnswer(value: string): void;
}

// Subskills whose expected answer is a single whole number (e.g. "find the common denominator")
// rather than a fraction — used to pick a sensible `defaultMode` per item so the student isn't
// asked to pick a shape before they've even read the question.
const WHOLE_NUMBER_SUBSKILLS = new Set<string>(["find-common-denominator"]);

export function answerModeForSubskill(subskillId: string): AnswerMode {
  return WHOLE_NUMBER_SUBSKILLS.has(subskillId) ? "whole" : "fraction";
}

export function FractionInput({
  onSubmit,
  disabled = false,
  label = "Your answer",
  formId,
  showSubmit = true,
  defaultMode = "fraction",
  className,
  ref,
}: {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  label?: string;
  /** Lets an external button drive submission via the `form` attribute (used with showSubmit=false). */
  formId?: string;
  /** Hide the built-in Check button when the surrounding layout renders its own action button. */
  showSubmit?: boolean;
  /** Which answer shape the toggle starts on; the student can still switch. */
  defaultMode?: AnswerMode;
  className?: string;
  /** Optional imperative handle (React 19 ref-as-prop) for one-shot answer injection; see FractionInputHandle. */
  ref?: Ref<FractionInputHandle>;
}) {
  const [mode, setMode] = useState<AnswerMode>(defaultMode);
  const [numerator, setNumerator] = useState("");
  const [denominator, setDenominator] = useState("");
  const numeratorId = useId();
  const denominatorId = useId();
  const numeratorRef = useRef<HTMLInputElement>(null);
  // Set only when the student clicks the toggle link (not on mount / defaultMode), so focus jumps
  // to the numerator field after a manual switch but never steals focus on first render.
  const focusPending = useRef(false);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    numeratorRef.current?.focus();
  }, [mode]);

  function toggleMode() {
    const next: AnswerMode = mode === "fraction" ? "whole" : "fraction";
    setMode(next);
    if (next === "whole") setDenominator(""); // a stale denominator must not leak into a whole-number answer
    focusPending.current = true;
  }

  useImperativeHandle(
    ref,
    () => ({
      setAnswer(value) {
        if (value.includes("/")) {
          const [n, d] = value.split("/");
          setMode("fraction");
          setNumerator(n);
          setDenominator(d);
        } else {
          setMode("whole");
          setNumerator(value);
          setDenominator(""); // mirrors toggleMode's stale-denominator guard so it can't leak into a whole-number answer
        }
        // focusPending covers the mode-change case (the [mode] effect below fires); that effect is a
        // no-op when the mode doesn't change, so also focus directly here to cover same-mode refills.
        focusPending.current = true;
        numeratorRef.current?.focus();
      },
    }),
    [],
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const num = numerator.trim();
    if (!num) return;
    // "num/den" for a fraction, or just "num" for a whole number — the exact shapes scoreAnswer expects.
    if (mode === "whole") return onSubmit(num);
    const den = denominator.trim();
    onSubmit(den ? `${num}/${den}` : num);
  }

  const fieldClasses = cn(
    // bg-surface (near-white in light) keeps the answer wells neutral on the elevated card —
    // surface-2 reads too green against white since the light palette went sage.
    "rounded-md border border-border bg-surface px-3 py-2 text-center text-xl font-bold text-ink",
    "placeholder:font-normal placeholder:text-ink-faint",
    "disabled:bg-transparent disabled:text-ink-faint",
  );

  return (
    // Pass className="items-center text-center" (+ showSubmit={false}) for centered card layouts.
    <form id={formId} className={cn("flex flex-col", className)} onSubmit={submit}>
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
          {mode === "fraction" ? (
            <div className="flex flex-col items-center gap-1">
              <label className="sr-only" htmlFor={numeratorId}>
                Numerator
              </label>
              <input
                ref={numeratorRef}
                id={numeratorId}
                inputMode="numeric"
                autoComplete="off"
                value={numerator}
                onChange={(event) => setNumerator(event.target.value)}
                placeholder="7"
                className={cn(fieldClasses, "w-24")}
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
                className={cn(fieldClasses, "w-24")}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <label className="sr-only" htmlFor={numeratorId}>
                {label}
              </label>
              <input
                ref={numeratorRef}
                id={numeratorId}
                inputMode="numeric"
                autoComplete="off"
                value={numerator}
                onChange={(event) => setNumerator(event.target.value)}
                placeholder="12"
                className={cn(fieldClasses, "w-28")}
              />
            </div>
          )}
        </fieldset>
        {showSubmit && (
          <button type="submit" disabled={disabled || !numerator.trim()} className={buttonClasses("focus", "lg", "px-8")}>
            Check
          </button>
        )}
      </div>

      {/* Quiet, reversible affordance instead of an upfront segmented control — the student can
          start answering right away, and only needs this if the default shape guessed wrong. */}
      <button
        type="button"
        onClick={toggleMode}
        disabled={disabled}
        className="mt-5 text-sm font-medium text-focus underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
      >
        {mode === "fraction" ? "Answer with a whole number instead" : "Answer with a fraction instead"}
      </button>

      {/* With the visible action button rendered outside the form (via the form attribute), this
          invisible in-form submit button keeps Enter-to-submit working in every browser. */}
      {!showSubmit && <button type="submit" hidden tabIndex={-1} aria-hidden="true" />}
    </form>
  );
}
