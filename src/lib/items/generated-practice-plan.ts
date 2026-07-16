import type { GeneratedPracticePlan } from "@/lib/ai/contracts";
import { createFractionOperationItem, type FractionOperation } from "@/lib/items/fraction-generator";
import { reduceRational, rationalToString } from "@/lib/math/rational";
import type { Item } from "@/lib/types";

/**
 * The model may propose only these small parameter records. This module owns
 * the deterministic checks and turns accepted parameters into learner-facing
 * items; no caller should assemble generated prompts or answer specs itself.
 */
export type GeneratedPracticePlanItem = GeneratedPracticePlan["items"][number];

type PlanKind = GeneratedPracticePlanItem["kind"];
type TargetSpec = { kind: PlanKind; operation?: FractionOperation };

const targetSpecs: Record<string, TargetSpec> = {
  "fraction-number-line": { kind: "number_line" },
  "equivalent-fractions": { kind: "equivalent_fraction" },
  "find-common-denominator": { kind: "common_denominator" },
  "add-unlike-denominators": { kind: "fraction_operation", operation: "add" },
  "subtract-unlike-denominators": { kind: "fraction_operation", operation: "subtract" },
};

/**
 * Unknown legacy fraction targets retain the previous fraction-operation
 * fallback. Known add/subtract targets are deliberately stricter.
 */
export function expectedGeneratedPlanTarget(targetSubskillId: string): TargetSpec {
  return targetSpecs[targetSubskillId] ?? { kind: "fraction_operation" };
}

const addFallback: GeneratedPracticePlanItem[] = [
  { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 },
  { kind: "fraction_operation", operation: "add", leftNumerator: 2, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
  { kind: "fraction_operation", operation: "add", leftNumerator: 3, leftDenominator: 8, rightNumerator: 1, rightDenominator: 6 },
];

const subtractFallback: GeneratedPracticePlanItem[] = [
  { kind: "fraction_operation", operation: "subtract", leftNumerator: 3, leftDenominator: 4, rightNumerator: 1, rightDenominator: 3 },
  { kind: "fraction_operation", operation: "subtract", leftNumerator: 4, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
  { kind: "fraction_operation", operation: "subtract", leftNumerator: 5, leftDenominator: 6, rightNumerator: 1, rightDenominator: 4 },
];

const numberLineFallback: GeneratedPracticePlanItem[] = [
  { kind: "number_line", numerator: 1, denominator: 2 },
  { kind: "number_line", numerator: 2, denominator: 3 },
  { kind: "number_line", numerator: 3, denominator: 4 },
];

const equivalentFallback: GeneratedPracticePlanItem[] = [
  { kind: "equivalent_fraction", numerator: 1, denominator: 3, multiplier: 2 },
  { kind: "equivalent_fraction", numerator: 2, denominator: 5, multiplier: 3 },
  { kind: "equivalent_fraction", numerator: 3, denominator: 4, multiplier: 2 },
];

const commonDenominatorFallback: GeneratedPracticePlanItem[] = [
  { kind: "common_denominator", leftDenominator: 3, rightDenominator: 4 },
  { kind: "common_denominator", leftDenominator: 4, rightDenominator: 5 },
  { kind: "common_denominator", leftDenominator: 3, rightDenominator: 5 },
];

/** Returns a fresh, target-safe fallback so retries cannot mutate shared data. */
export function generatedPracticePlanFallback(targetSubskillId: string): GeneratedPracticePlanItem[] {
  const items = targetSubskillId === "fraction-number-line"
    ? numberLineFallback
    : targetSubskillId === "equivalent-fractions"
      ? equivalentFallback
      : targetSubskillId === "find-common-denominator"
        ? commonDenominatorFallback
        : targetSubskillId === "subtract-unlike-denominators"
          ? subtractFallback
          : addFallback;
  return items.map((item) => ({ ...item }));
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= minimum && value <= maximum;
}

function assertProperFraction(numerator: unknown, denominator: unknown, limits: { numeratorMaximum: number; denominatorMaximum: number }, label: string) {
  if (!isIntegerInRange(numerator, 1, limits.numeratorMaximum)
    || !isIntegerInRange(denominator, 2, limits.denominatorMaximum)
    || numerator >= denominator) {
    throw new Error(`${label} must be a positive proper fraction within the supported bounds.`);
  }
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function leastCommonMultiple(left: number, right: number): number {
  return Math.abs(left * right) / greatestCommonDivisor(left, right);
}

function canonicalFraction(numerator: number, denominator: number): string {
  const fraction = reduceRational(numerator, denominator);
  if (!fraction) throw new Error("Generated fraction could not be normalized.");
  return rationalToString(fraction);
}

function duplicateKey(item: GeneratedPracticePlanItem): string {
  switch (item.kind) {
    case "fraction_operation": {
      const left = canonicalFraction(item.leftNumerator, item.leftDenominator);
      const right = canonicalFraction(item.rightNumerator, item.rightDenominator);
      const operands = item.operation === "add" ? [left, right].sort() : [left, right];
      return `${item.kind}:${item.operation}:${operands.join(":")}`;
    }
    case "number_line":
      return `${item.kind}:${canonicalFraction(item.numerator, item.denominator)}`;
    case "equivalent_fraction":
      return `${item.kind}:${canonicalFraction(item.numerator, item.denominator)}:${item.multiplier}`;
    case "common_denominator":
      return `${item.kind}:${[item.leftDenominator, item.rightDenominator].sort((a, b) => a - b).join(":")}`;
  }
}

/**
 * Rejects a live or cached model plan unless it is a small, pedagogically
 * valid parameter set for exactly the diagnosed target. It intentionally
 * duplicates essential Zod bounds so direct callers cannot bypass safety.
 */
export function validateGeneratedPracticePlan(input: { targetSubskillId: string; items: readonly GeneratedPracticePlanItem[] }): void {
  if (input.items.length < 3 || input.items.length > 4) {
    throw new Error("A generated practice plan must contain three or four items.");
  }

  const target = expectedGeneratedPlanTarget(input.targetSubskillId);
  const seen = new Set<string>();
  for (const item of input.items) {
    if (item.kind !== target.kind) {
      throw new Error("Practice plan did not match its diagnosed skill.");
    }

    switch (item.kind) {
      case "fraction_operation": {
        if (target.operation && item.operation !== target.operation) {
          throw new Error("Practice plan used the wrong operation for its diagnosed skill.");
        }
        assertProperFraction(item.leftNumerator, item.leftDenominator, { numeratorMaximum: 20, denominatorMaximum: 20 }, "Left operand");
        assertProperFraction(item.rightNumerator, item.rightDenominator, { numeratorMaximum: 20, denominatorMaximum: 20 }, "Right operand");
        if (item.leftDenominator === item.rightDenominator) {
          throw new Error("Fraction-operation plan used equal denominators.");
        }
        if (item.operation === "subtract"
          && item.leftNumerator * item.rightDenominator <= item.rightNumerator * item.leftDenominator) {
          throw new Error("Subtraction practice must have a positive result.");
        }
        break;
      }
      case "number_line":
        assertProperFraction(item.numerator, item.denominator, { numeratorMaximum: 19, denominatorMaximum: 20 }, "Number-line value");
        break;
      case "equivalent_fraction":
        assertProperFraction(item.numerator, item.denominator, { numeratorMaximum: 10, denominatorMaximum: 12 }, "Equivalent-fraction value");
        if (!isIntegerInRange(item.multiplier, 2, 6)) {
          throw new Error("Equivalent-fraction multiplier is outside the supported bounds.");
        }
        break;
      case "common_denominator": {
        if (!isIntegerInRange(item.leftDenominator, 2, 12) || !isIntegerInRange(item.rightDenominator, 2, 12)) {
          throw new Error("Common-denominator values are outside the supported bounds.");
        }
        const least = leastCommonMultiple(item.leftDenominator, item.rightDenominator);
        if (item.leftDenominator === item.rightDenominator || least <= Math.max(item.leftDenominator, item.rightDenominator)) {
          throw new Error("Common-denominator practice must require a non-trivial shared denominator.");
        }
        break;
      }
    }

    const key = duplicateKey(item);
    if (seen.has(key)) throw new Error("Practice plan repeated the same item.");
    seen.add(key);
  }
}

function materializeItem(input: { item: GeneratedPracticePlanItem; targetSubskillId: string; id: string; difficulty: number }): Item {
  const { item } = input;
  switch (item.kind) {
    case "fraction_operation":
      return createFractionOperationItem({
        id: input.id,
        operation: item.operation,
        left: { numerator: item.leftNumerator, denominator: item.leftDenominator },
        right: { numerator: item.rightNumerator, denominator: item.rightDenominator },
        subskillId: input.targetSubskillId,
        difficulty: input.difficulty,
      });
    case "number_line": {
      const reversed = `${item.denominator}/${item.numerator}`;
      return {
        id: input.id,
        subskillId: input.targetSubskillId,
        prompt: "What fraction names point C on the number line?",
        answerSpec: { accepted: [`${item.numerator}/${item.denominator}`] },
        distractorMap: reversed === `${item.numerator}/${item.denominator}` ? {} : { [reversed]: "reverses_numerator_and_denominator" },
        visualSpec: { kind: "number_line", denominator: item.denominator, markedNumerator: item.numerator, pointLabel: "C" },
      };
    }
    case "equivalent_fraction": {
      const targetDenominator = item.denominator * item.multiplier;
      const answer = `${item.numerator * item.multiplier}/${targetDenominator}`;
      // Scaling only the bottom — the exact misconception this item exists to catch.
      const denominatorOnly = `${item.numerator}/${targetDenominator}`;
      return {
        id: input.id,
        subskillId: input.targetSubskillId,
        // States the GOAL (the target denominator) and makes the learner derive the factor.
        // The previous wording ("when both parts are multiplied by N") handed over the method, so
        // it only tested one multiplication and explicitly told the student not to commit the very
        // error `denominatorOnly` below is designed to detect — the item could never catch it.
        // This mirrors the hand-written seed item: "Write a fraction equivalent to 1/2 with
        // denominator 8."
        prompt: `Write a fraction equivalent to ${item.numerator}/${item.denominator} with denominator ${targetDenominator}.`,
        // The prompt names the denominator, so the written form must match it — value-only scoring
        // would otherwise accept the question restated back.
        answerSpec: { accepted: [answer], rule: { kind: "exact_denominator", denominator: targetDenominator } },
        distractorMap: denominatorOnly === answer ? {} : { [denominatorOnly]: "changes_denominator_only" },
      };
    }
    case "common_denominator": {
      const least = leastCommonMultiple(item.leftDenominator, item.rightDenominator);
      return {
        id: input.id,
        subskillId: input.targetSubskillId,
        prompt: `What is a common denominator for 1/${item.leftDenominator} and 1/${item.rightDenominator}?`,
        answerSpec: {
          accepted: [String(least)],
          rule: {
            kind: "positive_common_multiple",
            denominators: [item.leftDenominator, item.rightDenominator],
          },
        },
        distractorMap: { [String(item.leftDenominator + item.rightDenominator)]: "adds_denominators" },
      };
    }
  }
}

/**
 * Single source of truth for generated prompt/answer construction. Validation
 * happens before any item is returned, so callers may safely replace a whole
 * fresh practice session only after this function succeeds.
 */
export function materializeGeneratedPracticePlan(input: {
  targetSubskillId: string;
  items: readonly GeneratedPracticePlanItem[];
  itemIdAt: (index: number) => string;
  difficultyAt?: (index: number) => number;
}): Item[] {
  validateGeneratedPracticePlan({ targetSubskillId: input.targetSubskillId, items: input.items });
  return input.items.map((item, index) => materializeItem({
    item,
    targetSubskillId: input.targetSubskillId,
    id: input.itemIdAt(index),
    difficulty: input.difficultyAt?.(index) ?? index + 1,
  }));
}
