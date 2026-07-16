"use client";

// A compact scale-factor workspace for equivalent-fraction practice. It
// highlights the relationship without drawing or calculating the answer.
import { useState } from "react";
import { Fraction } from "@/components/student/fraction";

export function parseEquivalentFractionPrompt(prompt: string) {
  const source = /(\d+)\s*\/\s*(\d+)/.exec(prompt);
  const target = /(?:with denominator|fraction over)\s+(\d+)/i.exec(prompt);
  if (!source || !target) return null;
  return {
    numerator: Number(source[1]),
    denominator: Number(source[2]),
    targetDenominator: Number(target[1]),
  };
}

export function EquivalentFractionModel({
  prompt,
  disabled,
  onUseAnswer,
}: {
  prompt: string;
  disabled?: boolean;
  onUseAnswer: (answer: string) => void;
}) {
  const values = parseEquivalentFractionPrompt(prompt);
  const [factor, setFactor] = useState("");
  const [newNumerator, setNewNumerator] = useState("");

  if (!values) return null;
  const { numerator, denominator, targetDenominator } = values;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        Find the number that changes the bottom to {targetDenominator}, then use that same number on top.
      </p>
      <div className="grid gap-3 rounded-lg border border-border bg-surface-2 p-4 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="flex items-center justify-center gap-2">
          <span>{denominator} ×</span>
          <input
            value={factor}
            onChange={(event) => setFactor(event.target.value.replace(/[^0-9]/g, ""))}
            disabled={disabled}
            inputMode="numeric"
            aria-label="Multiplier"
            className="h-10 w-14 rounded-md border border-border-strong bg-surface px-2 text-center text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          />
          <span>= {targetDenominator}</span>
        </div>
        <span className="hidden text-center text-ink-faint sm:block">then</span>
        <div className="flex items-center justify-center gap-2">
          <span>{numerator} × {factor || "?"} =</span>
          <input
            value={newNumerator}
            onChange={(event) => setNewNumerator(event.target.value.replace(/[^0-9]/g, ""))}
            disabled={disabled}
            inputMode="numeric"
            aria-label={`New numerator over ${targetDenominator}`}
            className="h-10 w-14 rounded-md border border-border-strong bg-surface px-2 text-center text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-ink">
        <span>Your fraction:</span>
        <Fraction numerator={Number(newNumerator) || 0} denominator={targetDenominator} size="md" />
        <button
          type="button"
          disabled={disabled || !newNumerator}
          onClick={() => onUseAnswer(`${newNumerator}/${targetDenominator}`)}
          className="font-medium text-focus underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          Use as my answer
        </button>
      </div>
    </div>
  );
}
