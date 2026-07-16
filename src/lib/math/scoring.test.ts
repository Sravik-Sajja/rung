import { describe, expect, it } from "vitest";
import { scoreAnswer } from "@/lib/math/scoring";
import type { Item } from "@/lib/types";

describe("structured and legacy common-denominator scoring", () => {
  it("scores structured positive common multiples without depending on prompt wording", () => {
    const item: Item = {
      id: "structured-common",
      subskillId: "find-common-denominator",
      prompt: "Name any shared denominator.",
      answerSpec: {
        accepted: ["12"],
        rule: { kind: "positive_common_multiple", denominators: [3, 4] },
      },
      distractorMap: {},
    };

    expect(scoreAnswer(item, "12")).toBe(true);
    expect(scoreAnswer(item, "24")).toBe(true);
    expect(scoreAnswer(item, "7")).toBe(false);
    expect(scoreAnswer(item, "12/1")).toBe(false);
  });

  it("keeps legacy seeded common-denominator prompts compatible", () => {
    const item: Item = {
      id: "legacy-common",
      subskillId: "find-common-denominator",
      prompt: "What common denominator can you use for 2/5 and 1/3?",
      answerSpec: { accepted: ["15"] },
      distractorMap: {},
    };

    expect(scoreAnswer(item, "15")).toBe(true);
    expect(scoreAnswer(item, "30")).toBe(true);
    expect(scoreAnswer(item, "8")).toBe(false);
  });
});

describe("exact_denominator scoring", () => {
  const equivalentItem: Item = {
    id: "equivalent-test",
    subskillId: "equivalent-fractions",
    prompt: "Write a fraction equivalent to 1/3 with denominator 6.",
    answerSpec: { accepted: ["2/6"], rule: { kind: "exact_denominator", denominator: 6 } },
    distractorMap: { "1/6": "changes_denominator_only" },
  };

  it("accepts the answer written over the requested denominator", () => {
    expect(scoreAnswer(equivalentItem, "2/6")).toBe(true);
    expect(scoreAnswer(equivalentItem, " 2 / 6 ")).toBe(true);
  });

  it("rejects the question restated back", () => {
    // The whole point of the rule: scoring compares by value and 1/3 IS equivalent to 2/6, so
    // without it a learner passes this item by retyping the fraction already in the prompt.
    expect(scoreAnswer(equivalentItem, "1/3")).toBe(false);
  });

  it("rejects the right value over the wrong denominator", () => {
    expect(scoreAnswer(equivalentItem, "4/12")).toBe(false);
    expect(scoreAnswer(equivalentItem, "3/9")).toBe(false);
  });

  it("rejects the right denominator carrying the wrong value", () => {
    // The value check still runs after the denominator guard.
    expect(scoreAnswer(equivalentItem, "3/6")).toBe(false);
    expect(scoreAnswer(equivalentItem, "1/6")).toBe(false);
  });

  it("rejects a whole number or an unparseable entry", () => {
    expect(scoreAnswer(equivalentItem, "2")).toBe(false);
    expect(scoreAnswer(equivalentItem, "six")).toBe(false);
  });

  it("leaves value-based items alone", () => {
    const additionItem: Item = {
      id: "add-test",
      subskillId: "add-unlike-denominators",
      prompt: "What is 1/3 + 1/4?",
      answerSpec: { accepted: ["7/12"] },
      distractorMap: { "2/7": "adds_numerators_and_denominators" },
    };
    // No rule, so any equivalent written form is still fine here.
    expect(scoreAnswer(additionItem, "7/12")).toBe(true);
    expect(scoreAnswer(additionItem, "14/24")).toBe(true);
    expect(scoreAnswer(additionItem, "2/7")).toBe(false);
  });
});
