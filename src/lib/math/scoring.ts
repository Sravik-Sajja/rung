// Deterministic fraction normalization and answer scoring; AI never decides correctness.
import type { Item } from "@/lib/types";
import { areEquivalentRationals } from "@/lib/math/rational";

export function normalizeFraction(value: string) { return value.trim().replace(/\s/g, ""); }
export function scoreAnswer(item: Item, answer: string) {
  const normalized = normalizeFraction(answer);
  return item.answerSpec.accepted.some((accepted) =>
    areEquivalentRationals(accepted, normalized) || normalizeFraction(accepted) === normalized,
  );
}
