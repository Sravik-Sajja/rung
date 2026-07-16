// Deterministic fraction normalization and answer scoring; AI never decides correctness.
import type { Item } from "@/lib/types";
import { areEquivalentRationals } from "@/lib/math/rational";

export function normalizeFraction(value: string) { return value.trim().replace(/\s/g, ""); }
export function scoreAnswer(item: Item, answer: string) {
  const normalized = normalizeFraction(answer);
  const commonDenominator = item.prompt.match(/common denominator for 1\/(\d+) and 1\/(\d+)/i);
  if (commonDenominator && /^\d+$/.test(normalized)) {
    const candidate = Number(normalized);
    return candidate > 0 && candidate % Number(commonDenominator[1]) === 0 && candidate % Number(commonDenominator[2]) === 0;
  }
  return item.answerSpec.accepted.some((accepted) =>
    areEquivalentRationals(accepted, normalized) || normalizeFraction(accepted) === normalized,
  );
}
