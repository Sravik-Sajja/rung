"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui";

export function AnswerInput({
  onSubmit,
  disabled = false,
  label = "Your answer",
}: {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [answer, setAnswer] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = answer.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit}>
      <label className="sr-only" htmlFor="student-answer">
        {label}
      </label>
      <input
        id="student-answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        disabled={disabled}
        placeholder="For example, 7/12"
        // A recessed well (bg-surface-2) against the card's bg-surface so the field reads as an
        // input to sink into, not a flat continuation of the card behind it.
        className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-4 py-3 text-lg font-semibold text-ink placeholder:font-normal placeholder:text-ink-faint disabled:bg-surface disabled:text-ink-faint"
      />
      <button type="submit" disabled={disabled || !answer.trim()} className={buttonClasses("primary", "lg")}>
        Check answer
      </button>
    </form>
  );
}
