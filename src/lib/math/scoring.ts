// Deterministic fraction normalization and answer scoring; AI never decides correctness.
import type { Item } from "@/lib/types";

export function normalizeFraction(value: string) { return value.trim().replace(/\s/g, ""); }
export function scoreAnswer(item: Item, answer: string) { return item.answerSpec.accepted.includes(normalizeFraction(answer)); }
