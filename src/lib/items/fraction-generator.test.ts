import { describe, expect, it } from "vitest";
import { createFractionOperationItem, generateFractionOperationItem, validateParametricFractionItem } from "@/lib/items/fraction-generator";

describe("parametric fraction generator", () => {
  it("generates a valid item with an exact answer and diagnostic distractor", () => {
    const item = createFractionOperationItem({
      id: "add-unlike-1",
      operation: "add",
      left: { numerator: 1, denominator: 3 },
      right: { numerator: 1, denominator: 4 },
    });
    expect(item.answerSpec.accepted).toEqual(["7/12"]);
    expect(item.distractorMap).toEqual({ "2/7": "adds_numerators_and_denominators" });
    expect(validateParametricFractionItem(item)).toBe(true);
  });

  it("is reproducible for a fixed seed", () => {
    expect(generateFractionOperationItem({ id: "seeded", seed: 12, operation: "subtract" }))
      .toEqual(generateFractionOperationItem({ id: "seeded", seed: 12, operation: "subtract" }));
  });

  it("rejects an item whose answer was changed", () => {
    const item = generateFractionOperationItem({ id: "tampered", seed: 9, operation: "add" });
    item.answerSpec.accepted[0] = "99/1";
    expect(validateParametricFractionItem(item)).toBe(false);
  });
});
