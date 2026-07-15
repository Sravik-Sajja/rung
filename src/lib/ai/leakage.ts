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

/**
 * The adapter receives a SafeItem without the answer key, so it also applies
 * this conservative generic screen before caching a live tutor response.
 * The domain layer should still run containsAnswerLeak when it has answer data.
 */
export function containsGenericTutorLeak(hint: string): boolean {
  const value = hint.trim().toLowerCase();
  if (!value) return true;
  return /\b(final answer|the answer is|answer\s*:|solution\s*:|therefore\s+the\s+answer)\b/.test(value)
    || /(?:^|\s)=\s*-?\d+(?:\/\d+|\.\d+)?(?:\s|$)/.test(value);
}
