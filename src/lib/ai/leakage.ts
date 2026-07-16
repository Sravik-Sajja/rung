import type { TutorHintProtection } from "@/lib/ai/contracts";
import { normalizeFraction } from "@/lib/math/scoring";
import { parseRational, type Rational } from "@/lib/math/rational";
import type { AnswerRule } from "@/lib/types";

function normalized(value: string): string {
  return normalizeFraction(value).toLowerCase();
}

function normalizedPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameRational(left: Rational, right: Rational): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

/**
 * Captures whole numeric expressions, not digits embedded in a larger number,
 * decimal, or fraction. That keeps `12` from matching `112`, `0.12`, or
 * `12/5`, while still recognizing `12.`, `14 / 24`, and `0.5`.
 */
function rationalTokens(text: string): Rational[] {
  const matches = text.matchAll(/(?<![\p{L}\p{N}_.\/])([+-]?(?:\d+\s*\/\s*[+-]?\d+|\d+\.\d*|\d+))(?![\p{L}\p{N}_\/]|\.(?=\d))/gu);
  const tokens: Rational[] = [];
  for (const match of matches) {
    const value = parseRational(match[1]);
    if (value) tokens.push(value);
  }
  return tokens;
}

function containsProtectedSolutionPhrase(hint: string, solutionSteps: readonly string[]): boolean {
  const candidate = normalizedPhrase(hint);
  if (!candidate) return true;
  return solutionSteps
    .map(normalizedPhrase)
    .filter((step) => step.length >= 3)
    .some((step) => candidate.includes(step));
}

function containsNonRationalAnswerLiteral(hint: string, answerValues: readonly string[]): boolean {
  const candidate = normalized(hint);
  return answerValues.some((answer) => {
    if (parseRational(answer)) return false;
    const protectedValue = normalized(answer);
    return protectedValue.length >= 3 && candidate.includes(protectedValue);
  });
}

function isStructuredCommonMultiple(value: Rational, rule: AnswerRule | undefined): boolean {
  if (rule?.kind !== "positive_common_multiple" || value.denominator !== 1 || value.numerator <= 0) return false;
  return rule.denominators.every((denominator) => value.numerator % denominator === 0);
}

/**
 * Item-aware deterministic guard for exact answers, equivalent rationals,
 * standalone numeric answers, structured common multiples, and full solution
 * phrases. It accepts only server-derived protection context.
 */
export function containsAnswerLeak(
  hint: string,
  answerValues: readonly string[],
  solutionSteps: readonly string[] = [],
  answerRule?: AnswerRule,
): boolean {
  if (!hint.trim()) return true;

  const protectedRationals = answerValues
    .map((answer) => parseRational(answer))
    .filter((answer): answer is Rational => answer !== null);
  const tokens = rationalTokens(hint);

  if (tokens.some((token) => protectedRationals.some((answer) => sameRational(token, answer)))) return true;
  if (tokens.some((token) => isStructuredCommonMultiple(token, answerRule))) return true;
  if (containsNonRationalAnswerLiteral(hint, answerValues)) return true;
  return containsProtectedSolutionPhrase(hint, solutionSteps);
}

/** Combines generic and item-specific protection for the tutor-only boundary. */
export function containsTutorHintLeak(hint: string, protection: TutorHintProtection): boolean {
  return containsGenericTutorLeak(hint)
    || containsAnswerLeak(
      hint,
      protection.protectedAnswers,
      protection.protectedSolutionSteps,
      protection.protectedAnswerRule,
    );
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
