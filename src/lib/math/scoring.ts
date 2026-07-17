// Deterministic fraction normalization and answer scoring; AI never decides correctness.
import type { AnswerSpec, Item } from "@/lib/types";
import { areEquivalentRationals } from "@/lib/math/rational";

export function normalizeFraction(value: string) { return value.trim().replace(/\s/g, ""); }

/**
 * `answerSpec` is optional here only because durable `items` rows are read back from the
 * database, where a row can arrive without one. Scoring always passes a full Item.
 */
type ScorableItem = { prompt: string; answerSpec?: AnswerSpec | null };

function positiveCommonMultipleRule(item: ScorableItem): readonly [number, number] | null {
  const rule = item.answerSpec?.rule;
  if (rule?.kind === "positive_common_multiple") return rule.denominators;

  // Seeded legacy rows predate structured answer rules. Preserve their
  // intended behavior without making scoring depend on one exact sentence.
  if (!/common denominator/i.test(item.prompt)) return null;
  const fractions = item.prompt.match(/\d+\s*\/\s*(\d+)\s+and\s+\d+\s*\/\s*(\d+)/i);
  if (!fractions) return null;
  return [Number(fractions[1]), Number(fractions[2])];
}

function isPositiveCommonMultiple(value: string, denominators: readonly [number, number]): boolean {
  if (!/^\d+$/.test(value)) return false;
  const candidate = Number(value);
  return Number.isSafeInteger(candidate)
    && candidate > 0
    && denominators.every((denominator) => Number.isSafeInteger(denominator) && denominator > 0 && candidate % denominator === 0);
}

/**
 * The denominator the learner actually wrote, before any reduction — `parseRational` reduces, so
 * it cannot answer this. Returns null for a whole number or an unparseable entry.
 */
function writtenDenominator(value: string): number | null {
  const match = /^-?\d+\/(\d+)$/.exec(value);
  return match ? Number(match[1]) : null;
}

/**
 * A teacher-facing description of what scoring accepts for one item. It reads the same
 * rules `scoreAnswer` does, so the dashboard can never contradict the result the learner
 * was actually given. Common-denominator items name the least common multiple but accept
 * any positive common multiple, so the description has to say so.
 */
export function describeAcceptedAnswer(item: ScorableItem): string {
  const accepted = item.answerSpec?.accepted;
  // A durable row can come back without a usable spec. Say so rather than throwing (which
  // would take the whole dashboard down) or rendering blank (which reads as "no answer").
  if (!accepted?.length) return "Not recorded for this item.";

  const commonDenominators = positiveCommonMultipleRule(item);
  if (commonDenominators) {
    const [left, right] = commonDenominators;
    return `${accepted[0]} — any common multiple of ${left} and ${right} is accepted`;
  }
  return accepted.join(" or ");
}

export function scoreAnswer(item: Item, answer: string) {
  const normalized = normalizeFraction(answer);
  const commonDenominators = positiveCommonMultipleRule(item);
  if (commonDenominators) return isPositiveCommonMultiple(normalized, commonDenominators);

  const rule = item.answerSpec.rule;
  // "Write a fraction equivalent to 1/3 with denominator 6" asks for a specific WRITTEN form, but
  // the value check below compares fractions by value: without this guard it would accept "1/3"
  // (the question restated back) and "4/12" (right value, wrong denominator). The value check still
  // runs afterwards, so "3/6" — right denominator, wrong value — is still wrong.
  if (rule?.kind === "exact_denominator" && writtenDenominator(normalized) !== rule.denominator) return false;

  return item.answerSpec.accepted.some((accepted) =>
    areEquivalentRationals(accepted, normalized) || normalizeFraction(accepted) === normalized,
  );
}
