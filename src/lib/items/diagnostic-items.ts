// Builds the five-question fractions diagnostic for one learner.
//
// The diagnostic has five SLOTS, one per subskill, in a fixed order under the five canonical item
// ids (locked by `canonicalDiagnosticItemIds` and its contract test). Each slot is filled from a
// bank of question forms for that subskill, and both the form and its numbers are chosen
// deterministically from the student id. So the bank is much larger than five, every learner gets a
// randomly selected five, and two learners sitting next to each other cannot copy each other.
//
// Why the selection is stratified (one per subskill) rather than five free draws from one flat
// bank: `selectDiagnosticGap` can only find a gap in a skill it actually asked about, and the
// teacher heatmap has a column per subskill. Free draws would regularly leave a skill unmeasured
// and silently blind the diagnostic to the very gap it exists to find.
//
// Selection is seeded, never Math.random(): answers are keyed by item id mid-session, so a reroll
// on reload would score a learner against questions they never saw.
//
// Every answer and distractor is computed here, beside the numbers that produced it. No model
// authors any part of an item. Distractors reuse only misconception tags the diagnosis copy already
// understands.
import { canonicalDemoIds, canonicalDemoSubskillIds, canonicalDiagnosticItemIds } from "@/lib/demo/contracts";
import { createFractionOperationItem, type FractionOperand } from "@/lib/items/fraction-generator";
import type { Item } from "@/lib/types";

type Random = () => number;
type ItemForm = (random: Random, id: string) => Item;

/** djb2. Stable across processes and platforms. */
function seedFromStudentId(studentId: string): number {
  let hash = 5381;
  for (let index = 0; index < studentId.length; index += 1) {
    hash = ((hash << 5) + hash + studentId.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, deterministic. */
function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: Random, pool: readonly T[]): T {
  return pool[Math.floor(random() * pool.length)] as T;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function leastCommonMultiple(a: number, b: number): number {
  return (a * b) / greatestCommonDivisor(a, b);
}

// Curated pools, not arbitrary ranges: every combination stays inside grade-band-appropriate
// fractions with small denominators and a clean, non-negative answer.
const PROPER_FRACTIONS: readonly FractionOperand[] = [
  { numerator: 1, denominator: 2 },
  { numerator: 1, denominator: 3 },
  { numerator: 2, denominator: 3 },
  { numerator: 1, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 2, denominator: 5 },
  { numerator: 3, denominator: 5 },
];
const EQUIVALENT_MULTIPLIERS: readonly number[] = [2, 3, 4];
const DENOMINATOR_PAIRS: readonly (readonly [number, number])[] = [
  [3, 4], [2, 5], [3, 5], [2, 3], [4, 6], [5, 6], [4, 5], [3, 6],
];
const ADDITION_PAIRS: readonly (readonly [FractionOperand, FractionOperand])[] = [
  [{ numerator: 1, denominator: 3 }, { numerator: 1, denominator: 4 }],
  [{ numerator: 2, denominator: 5 }, { numerator: 1, denominator: 3 }],
  [{ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 5 }],
  [{ numerator: 1, denominator: 6 }, { numerator: 1, denominator: 4 }],
  [{ numerator: 2, denominator: 3 }, { numerator: 1, denominator: 5 }],
  [{ numerator: 1, denominator: 4 }, { numerator: 2, denominator: 5 }],
];
// Left is deliberately larger than right so a subtraction never asks a 6th grader for a negative.
const SUBTRACTION_PAIRS: readonly (readonly [FractionOperand, FractionOperand])[] = [
  [{ numerator: 3, denominator: 4 }, { numerator: 1, denominator: 3 }],
  [{ numerator: 2, denominator: 3 }, { numerator: 1, denominator: 4 }],
  [{ numerator: 4, denominator: 5 }, { numerator: 1, denominator: 2 }],
  [{ numerator: 5, denominator: 6 }, { numerator: 1, denominator: 4 }],
  [{ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 3 }],
  [{ numerator: 3, denominator: 5 }, { numerator: 1, denominator: 3 }],
];

/** Strips the parametric extras (notably `solutionSteps`) down to the plain scoring contract. */
function toItem(built: { id: string; subskillId: string; prompt: string; answerSpec: Item["answerSpec"]; distractorMap: Record<string, string> }): Item {
  return {
    id: built.id,
    subskillId: built.subskillId,
    prompt: built.prompt,
    answerSpec: built.answerSpec,
    distractorMap: built.distractorMap,
  };
}

// --- Equivalent fractions -----------------------------------------------------------------
// Both forms state the TARGET DENOMINATOR and make the learner derive the factor, so the
// "scaled only the bottom" distractor can actually fire.

type EquivalentShape = { prompt: string; answer: string; distractor: string; targetDenominator: number };

function scaleUpEquivalent(random: Random): EquivalentShape {
  const base = pick(random, PROPER_FRACTIONS);
  const multiplier = pick(random, EQUIVALENT_MULTIPLIERS);
  const targetDenominator = base.denominator * multiplier;
  return {
    prompt: `Write a fraction equivalent to ${base.numerator}/${base.denominator} with denominator ${targetDenominator}.`,
    answer: `${base.numerator * multiplier}/${targetDenominator}`,
    distractor: `${base.numerator}/${targetDenominator}`,
    targetDenominator,
  };
}

function completeEquivalent(random: Random): EquivalentShape {
  const base = pick(random, PROPER_FRACTIONS);
  const multiplier = pick(random, EQUIVALENT_MULTIPLIERS);
  const targetDenominator = base.denominator * multiplier;
  return {
    prompt: `Complete the equivalent fraction: ${base.numerator}/${base.denominator} is the same value as which fraction over ${targetDenominator}?`,
    answer: `${base.numerator * multiplier}/${targetDenominator}`,
    distractor: `${base.numerator}/${targetDenominator}`,
    targetDenominator,
  };
}

const EQUIVALENT_FORMS: readonly ItemForm[] = [scaleUpEquivalent, completeEquivalent].map((shape) => (random, id) => {
  const { prompt, answer, distractor, targetDenominator } = shape(random);
  return {
    id,
    subskillId: canonicalDemoSubskillIds[0],
    prompt,
    // Both forms name the target denominator, and scoring compares by value — the rule is what
    // stops "1/3" (the question restated back) from scoring correct.
    answerSpec: { accepted: [answer], rule: { kind: "exact_denominator", denominator: targetDenominator } },
    distractorMap: distractor === answer ? {} : { [distractor]: "changes_denominator_only" },
  };
});

// --- Fraction on a number line ------------------------------------------------------------

const NUMBER_LINE_FORMS: readonly ItemForm[] = [
  (random, id) => {
    const point = pick(random, PROPER_FRACTIONS);
    const answer = `${point.numerator}/${point.denominator}`;
    const reversed = `${point.denominator}/${point.numerator}`;
    return {
      id,
      subskillId: canonicalDemoSubskillIds[1],
      prompt: "What fraction names point C on the number line?",
      answerSpec: { accepted: [answer] },
      distractorMap: reversed === answer ? {} : { [reversed]: "reverses_numerator_and_denominator" },
      visualSpec: { kind: "number_line", denominator: point.denominator, markedNumerator: point.numerator, pointLabel: "C" },
    };
  },
  (random, id) => {
    const point = pick(random, PROPER_FRACTIONS);
    const answer = `${point.numerator}/${point.denominator}`;
    const reversed = `${point.denominator}/${point.numerator}`;
    return {
      id,
      subskillId: canonicalDemoSubskillIds[1],
      prompt: "Look at the number line. What fraction names point C?",
      answerSpec: { accepted: [answer] },
      distractorMap: reversed === answer ? {} : { [reversed]: "reverses_numerator_and_denominator" },
      visualSpec: { kind: "number_line", denominator: point.denominator, markedNumerator: point.numerator, pointLabel: "C" },
    };
  },
];

// --- Common denominator -------------------------------------------------------------------
// Only register the "added the denominators" distractor when that sum is genuinely wrong: for a
// pair like 2 and 4 the sum is a real common multiple and must not be scored as a misconception.

function addsDenominatorsDistractor(left: number, right: number): Record<string, string> {
  const sum = left + right;
  return sum % left === 0 && sum % right === 0 ? {} : { [String(sum)]: "adds_denominators" };
}

const COMMON_DENOMINATOR_FORMS: readonly ItemForm[] = [
  (random, id) => {
    const [left, right] = pick(random, DENOMINATOR_PAIRS);
    return {
      id,
      subskillId: canonicalDemoIds.commonDenominatorSubskillId,
      prompt: `What common denominator can you use for 1/${left} and 1/${right}?`,
      // The rule accepts ANY positive common multiple, not just the least.
      answerSpec: { accepted: [String(leastCommonMultiple(left, right))], rule: { kind: "positive_common_multiple", denominators: [left, right] } },
      distractorMap: addsDenominatorsDistractor(left, right),
    };
  },
  (random, id) => {
    const [left, right] = pick(random, DENOMINATOR_PAIRS);
    return {
      id,
      subskillId: canonicalDemoIds.commonDenominatorSubskillId,
      prompt: `Before adding 1/${left} and 1/${right}, what denominator should both fractions share?`,
      answerSpec: { accepted: [String(leastCommonMultiple(left, right))], rule: { kind: "positive_common_multiple", denominators: [left, right] } },
      distractorMap: addsDenominatorsDistractor(left, right),
    };
  },
  (random, id) => {
    const [left, right] = pick(random, DENOMINATOR_PAIRS);
    // "Smallest" deliberately carries NO positive_common_multiple rule: this form asks for the
    // least common multiple specifically, so a larger common multiple is not a correct answer.
    return {
      id,
      subskillId: canonicalDemoIds.commonDenominatorSubskillId,
      prompt: `What is the smallest number that both ${left} and ${right} divide into evenly?`,
      answerSpec: { accepted: [String(leastCommonMultiple(left, right))] },
      distractorMap: addsDenominatorsDistractor(left, right),
    };
  },
];

// --- Add / subtract with unlike denominators ----------------------------------------------
// The operation math, answer, and distractor all come from the shared parametric generator; these
// forms only vary how the question is asked.

function operationForms(
  operation: "add" | "subtract",
  subskillId: string,
  pairs: readonly (readonly [FractionOperand, FractionOperand])[],
  storyPrompt: (left: FractionOperand, right: FractionOperand) => string,
): readonly ItemForm[] {
  const build = (random: Random, id: string) => {
    const [left, right] = pick(random, pairs);
    return { built: toItem(createFractionOperationItem({ id, operation, left, right, subskillId })), left, right };
  };
  return [
    (random, id) => build(random, id).built,
    (random, id) => {
      const { built, left, right } = build(random, id);
      return { ...built, prompt: storyPrompt(left, right) };
    },
  ];
}

const ADD_FORMS = operationForms(
  "add",
  canonicalDemoSubskillIds[3],
  ADDITION_PAIRS,
  (left, right) => `A recipe uses ${left.numerator}/${left.denominator} cup of flour and ${right.numerator}/${right.denominator} cup of sugar. How much is that altogether?`,
);

const SUBTRACT_FORMS = operationForms(
  "subtract",
  canonicalDemoSubskillIds[4],
  SUBTRACTION_PAIRS,
  (left, right) => `A jug holds ${left.numerator}/${left.denominator} of a litre. You pour out ${right.numerator}/${right.denominator} of a litre. How much is left?`,
);

/** One slot per subskill, in `canonicalDiagnosticItemIds` order. */
const FORM_BANK: readonly (readonly ItemForm[])[] = [
  EQUIVALENT_FORMS,
  NUMBER_LINE_FORMS,
  COMMON_DENOMINATOR_FORMS,
  ADD_FORMS,
  SUBTRACT_FORMS,
];

/** Total question forms available across all five slots. Exported so tests can assert it beats 5. */
export const DIAGNOSTIC_FORM_COUNT = FORM_BANK.reduce((total, forms) => total + forms.length, 0);

/**
 * The five diagnostic items for `studentId`, in `canonicalDiagnosticItemIds` order.
 * Deterministic: the same student id always yields the same five questions.
 */
export function buildDiagnosticItems(studentId: string): Item[] {
  const random = createRandom(seedFromStudentId(studentId));
  return canonicalDiagnosticItemIds.map((id, index) => pick(random, FORM_BANK[index] as readonly ItemForm[])(random, id));
}

/** A generated item plus the slot it fills. The slot is the stable, canonical id. */
export type DiagnosticSessionItem = { item: Item; slotId: string; position: number };

/**
 * The five items for one diagnostic session, each carrying a session-scoped id.
 *
 * Ids are unique per session because these rows are inserted into `items`, and a
 * shared id would mean one learner's numbers overwriting another's. The slot id
 * survives separately: it is what the heatmap columns, `selectDiagnosticGap`, and
 * the seeded assignment all key off, and it must not move.
 *
 * The seed takes the session id, so re-sitting the check-in in another class
 * draws a fresh five. Determinism here is a convenience for tests, not a
 * correctness requirement — unlike `buildDiagnosticItems`, nothing re-derives
 * these on read. The session's items are read back from the rows written at
 * materialization, which is what keeps the learner's question, the scorer's
 * answer key, and the teacher's evidence view the same object.
 */
export function buildDiagnosticSessionItems(input: {
  studentId: string;
  assignmentId: string;
  diagnosticSessionId: string;
}): DiagnosticSessionItem[] {
  const random = createRandom(
    seedFromStudentId(`${input.studentId}:${input.assignmentId}:${input.diagnosticSessionId}`),
  );
  return canonicalDiagnosticItemIds.map((slotId, index) => {
    const built = pick(random, FORM_BANK[index] as readonly ItemForm[])(random, slotId);
    return {
      item: { ...built, id: `${slotId}--${input.diagnosticSessionId}` },
      slotId,
      position: index + 1,
    };
  });
}
