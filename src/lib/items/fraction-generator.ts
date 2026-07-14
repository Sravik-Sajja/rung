import { reduceRational, rationalToString, type Rational } from "@/lib/math/rational";

export type FractionOperation = "add" | "subtract";
export type FractionOperand = Readonly<{ numerator: number; denominator: number }>;

export interface ParametricFractionItem {
  id: string;
  subskillId: string;
  itemType: "fraction_operation";
  operation: FractionOperation;
  operands: readonly [FractionOperand, FractionOperand];
  prompt: string;
  answerSpec: { accepted: string[] };
  distractorMap: Record<string, string>;
  solutionSteps: string[];
  difficulty: number;
}

function display({ numerator, denominator }: FractionOperand): string {
  return `${numerator}/${denominator}`;
}

function correctAnswer([left, right]: readonly [FractionOperand, FractionOperand], operation: FractionOperation): Rational {
  const numerator = operation === "add"
    ? left.numerator * right.denominator + right.numerator * left.denominator
    : left.numerator * right.denominator - right.numerator * left.denominator;
  return reduceRational(numerator, left.denominator * right.denominator)!;
}

function directNumeratorDenominatorMistake(
  [left, right]: readonly [FractionOperand, FractionOperand],
  operation: FractionOperation,
): Rational | null {
  const numerator = operation === "add"
    ? left.numerator + right.numerator
    : left.numerator - right.numerator;
  return reduceRational(numerator, left.denominator + right.denominator);
}

export function createFractionOperationItem(input: {
  id: string;
  operation: FractionOperation;
  left: FractionOperand;
  right: FractionOperand;
  subskillId?: string;
  difficulty?: number;
}): ParametricFractionItem {
  const operands = [input.left, input.right] as const;
  const answer = correctAnswer(operands, input.operation);
  const directMistake = directNumeratorDenominatorMistake(operands, input.operation);
  if (!answer || input.left.denominator === 0 || input.right.denominator === 0) {
    throw new Error("Fraction operands must have non-zero integer denominators.");
  }
  const operationSymbol = input.operation === "add" ? "+" : "-";
  const distractorMap: Record<string, string> = {};
  if (directMistake && rationalToString(directMistake) !== rationalToString(answer)) {
    distractorMap[rationalToString(directMistake)] = "adds_numerators_and_denominators";
  }
  return {
    id: input.id,
    subskillId: input.subskillId ?? "add-fractions-unlike-denominators",
    itemType: "fraction_operation",
    operation: input.operation,
    operands,
    prompt: `What is ${display(input.left)} ${operationSymbol} ${display(input.right)}?`,
    answerSpec: { accepted: [rationalToString(answer)] },
    distractorMap,
    solutionSteps: [
      "Find a common denominator.",
      "Rewrite both fractions with that denominator.",
      `${input.operation === "add" ? "Add" : "Subtract"} the numerators and simplify.`,
    ],
    difficulty: input.difficulty ?? 1,
  };
}

/** Deterministic demo generator: identical seed and operation always yield the same item. */
export function generateFractionOperationItem(input: { id: string; seed: number; operation: FractionOperation }): ParametricFractionItem {
  const denominators = [3, 4, 5, 6, 8];
  const index = Math.abs(Math.trunc(input.seed));
  const leftDenominator = denominators[index % denominators.length];
  const rightDenominator = denominators[(index * 3 + 1) % denominators.length];
  const left: FractionOperand = { numerator: index % (leftDenominator - 1) + 1, denominator: leftDenominator };
  const right: FractionOperand = { numerator: (index * 5 + 1) % (rightDenominator - 1) + 1, denominator: rightDenominator };
  return createFractionOperationItem({ id: input.id, operation: input.operation, left, right, difficulty: 1 + index % 3 });
}

export function validateParametricFractionItem(item: ParametricFractionItem): boolean {
  if (!item.id || item.operands.length !== 2 || !item.answerSpec.accepted.length || !item.prompt) return false;
  const [left, right] = item.operands;
  if (!Number.isSafeInteger(left.numerator) || !Number.isSafeInteger(right.numerator)
    || left.denominator === 0 || right.denominator === 0) return false;
  const expected = correctAnswer(item.operands, item.operation);
  if (!expected || item.answerSpec.accepted[0] !== rationalToString(expected)) return false;
  return Object.entries(item.distractorMap).every(([answer, tag]) => {
    const mistaken = directNumeratorDenominatorMistake(item.operands, item.operation);
    return tag === "adds_numerators_and_denominators" && mistaken !== null && answer === rationalToString(mistaken);
  });
}
