import { describe, expect, it } from "vitest";
import {
  generatedPracticePlanFallback,
  materializeGeneratedPracticePlan,
  validateGeneratedPracticePlan,
  type GeneratedPracticePlanItem,
} from "@/lib/items/generated-practice-plan";
import { scoreAnswer } from "@/lib/math/scoring";

const commonDenominatorItems = [
  { kind: "common_denominator", leftDenominator: 3, rightDenominator: 4 },
  { kind: "common_denominator", leftDenominator: 4, rightDenominator: 5 },
  { kind: "common_denominator", leftDenominator: 3, rightDenominator: 5 },
] satisfies GeneratedPracticePlanItem[];

describe("generated practice plan validation and materialization", () => {
  it("materializes common-denominator parameters with a structured positive-multiple rule", () => {
    const [item] = materializeGeneratedPracticePlan({
      targetSubskillId: "find-common-denominator",
      items: commonDenominatorItems,
      itemIdAt: (index) => `generated-${index + 1}`,
    });

    expect(item).toMatchObject({
      id: "generated-1",
      prompt: "What is a common denominator for 1/3 and 1/4?",
      answerSpec: {
        accepted: ["12"],
        rule: { kind: "positive_common_multiple", denominators: [3, 4] },
      },
    });
    expect(scoreAnswer(item, "24")).toBe(true);
    expect(scoreAnswer(item, "7")).toBe(false);
  });

  it("creates every generated item kind through the same materializer", () => {
    const cases: Array<{ targetSubskillId: string; expectedPrompt: string }> = [
      { targetSubskillId: "fraction-number-line", expectedPrompt: "What fraction names point C on the number line?" },
      { targetSubskillId: "equivalent-fractions", expectedPrompt: "Write a fraction equivalent to 1/3 with denominator 6." },
      { targetSubskillId: "find-common-denominator", expectedPrompt: "What is a common denominator for 1/3 and 1/4?" },
      { targetSubskillId: "add-unlike-denominators", expectedPrompt: "What is 1/3 + 1/4?" },
      { targetSubskillId: "subtract-unlike-denominators", expectedPrompt: "What is 3/4 - 1/3?" },
    ];

    for (const testCase of cases) {
      const [item] = materializeGeneratedPracticePlan({
        targetSubskillId: testCase.targetSubskillId,
        items: generatedPracticePlanFallback(testCase.targetSubskillId),
        itemIdAt: (index) => `${testCase.targetSubskillId}-${index}`,
      });
      expect(item.prompt).toBe(testCase.expectedPrompt);
    }
  });

  it("materializes number-line plans as labelled visual questions without leaking the answer", () => {
    const [item] = materializeGeneratedPracticePlan({
      targetSubskillId: "fraction-number-line",
      items: generatedPracticePlanFallback("fraction-number-line"),
      itemIdAt: () => "number-line-visual",
    });
    expect(item.visualSpec).toEqual({ kind: "number_line", denominator: 2, markedNumerator: 1, pointLabel: "C" });
    expect(item.prompt).not.toContain("1/2");
    expect(scoreAnswer(item, "1/2")).toBe(true);
  });

  it("uses target-specific safe fallbacks", () => {
    const add = generatedPracticePlanFallback("add-unlike-denominators");
    const subtract = generatedPracticePlanFallback("subtract-unlike-denominators");
    const common = generatedPracticePlanFallback("find-common-denominator");

    expect(add.every((item) => item.kind === "fraction_operation" && item.operation === "add")).toBe(true);
    expect(subtract.every((item) => item.kind === "fraction_operation" && item.operation === "subtract")).toBe(true);
    expect(common.every((item) => item.kind === "common_denominator")).toBe(true);
    expect(() => validateGeneratedPracticePlan({ targetSubskillId: "add-unlike-denominators", items: add })).not.toThrow();
    expect(() => validateGeneratedPracticePlan({ targetSubskillId: "subtract-unlike-denominators", items: subtract })).not.toThrow();
  });

  it("rejects a wrong target kind, invalid proper fraction, wrong operation, trivial denominator, and duplicate", () => {
    expect(() => validateGeneratedPracticePlan({
      targetSubskillId: "find-common-denominator",
      items: generatedPracticePlanFallback("add-unlike-denominators"),
    })).toThrow(/diagnosed skill/i);

    expect(() => validateGeneratedPracticePlan({
      targetSubskillId: "fraction-number-line",
      items: [
        { kind: "number_line", numerator: 3, denominator: 3 },
        { kind: "number_line", numerator: 2, denominator: 3 },
        { kind: "number_line", numerator: 3, denominator: 4 },
      ],
    })).toThrow(/proper fraction/i);

    expect(() => validateGeneratedPracticePlan({
      targetSubskillId: "subtract-unlike-denominators",
      items: generatedPracticePlanFallback("add-unlike-denominators"),
    })).toThrow(/wrong operation/i);

    expect(() => validateGeneratedPracticePlan({
      targetSubskillId: "find-common-denominator",
      items: [
        { kind: "common_denominator", leftDenominator: 3, rightDenominator: 6 },
        { kind: "common_denominator", leftDenominator: 4, rightDenominator: 5 },
        { kind: "common_denominator", leftDenominator: 3, rightDenominator: 5 },
      ],
    })).toThrow(/non-trivial/i);

    expect(() => validateGeneratedPracticePlan({
      targetSubskillId: "find-common-denominator",
      items: [
        { kind: "common_denominator", leftDenominator: 3, rightDenominator: 4 },
        { kind: "common_denominator", leftDenominator: 4, rightDenominator: 3 },
        { kind: "common_denominator", leftDenominator: 3, rightDenominator: 5 },
      ],
    })).toThrow(/repeated/i);
  });
});
