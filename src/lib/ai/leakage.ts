import { normalizeFraction } from "@/lib/math/scoring";

function normalized(value: string): string {
  return normalizeFraction(value).toLowerCase();
}

/** A conservative deterministic guard for direct answer and full-step leakage. */
export function containsAnswerLeak(hint: string, answerValues: readonly string[], solutionSteps: readonly string[] = []): boolean {
  const candidate = normalized(hint);
  if (!candidate) return true;
  return [...answerValues, ...solutionSteps]
    .map(normalized)
    .filter((value) => value.length >= 3)
    .some((protectedValue) => candidate.includes(protectedValue));
}
