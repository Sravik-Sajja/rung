import { describe, expect, it } from "vitest";
import { generatedPracticePlanFallback } from "@/lib/items/generated-practice-plan";
import { buildPersistedGeneratedPlanPayload, isPracticeSessionResolved } from "@/lib/student/learning-service";

describe("persisted generated-practice payload", () => {
  it("materializes deterministic items and exposes a real first item ID", () => {
    let sequence = 0;
    const payload = buildPersistedGeneratedPlanPayload({
      idFor: (prefix) => `${prefix}-${++sequence}`,
      plans: [{
        targetSubskillId: "find-common-denominator",
        misconceptionTag: "adds_denominators",
        title: "find common denominator",
        reason: "Assigned because you missed find common denominator.",
        generationSource: "fallback",
        generationPromptVersion: "practice-plan-v1",
        generationAiRunRef: "fallback-practice-plan-find-common-denominator",
        items: [
          { kind: "common_denominator", leftDenominator: 3, rightDenominator: 4 },
          { kind: "common_denominator", leftDenominator: 4, rightDenominator: 5 },
          { kind: "common_denominator", leftDenominator: 3, rightDenominator: 5 },
        ],
      }],
    });

    expect(payload.summaries).toEqual([expect.objectContaining({
      id: "practice-1",
      firstItemId: "generated-practice-2",
      itemCount: 3,
      status: "active",
    })]);
    expect(payload.plans[0]?.items.map((item) => item.id)).toEqual([
      "generated-practice-2",
      "generated-practice-3",
      "generated-practice-4",
    ]);
    expect(payload.plans[0]?.items[0]).toMatchObject({
      itemType: "generated_practice",
      answerSpec: {
        accepted: ["12"],
        rule: { kind: "positive_common_multiple", denominators: [3, 4] },
      },
      parametricSpec: { kind: "common_denominator", leftDenominator: 3, rightDenominator: 4 },
    });
  });

  it("preserves the prepared prerequisite-first target order for atomic persistence", () => {
    let sequence = 0;
    const payload = buildPersistedGeneratedPlanPayload({
      idFor: (prefix) => `${prefix}-${++sequence}`,
      plans: [
        {
          targetSubskillId: "equivalent-fractions",
          misconceptionTag: "scales_one_side_only",
          title: "Build equivalent fractions",
          reason: "Practice this prerequisite before common denominators.",
          generationSource: "fallback",
          generationPromptVersion: "practice-plan-v1",
          items: generatedPracticePlanFallback("equivalent-fractions"),
        },
        {
          targetSubskillId: "find-common-denominator",
          misconceptionTag: "adds_denominators",
          title: "Find common denominators",
          reason: "Practice the diagnosed fraction skill next.",
          generationSource: "fallback",
          generationPromptVersion: "practice-plan-v1",
          items: generatedPracticePlanFallback("find-common-denominator"),
        },
      ],
    });

    // The finalizer uses this JSON array's ordinality as its durable position.
    expect(payload.plans.map((plan) => plan.targetSubskillId)).toEqual([
      "equivalent-fractions",
      "find-common-denominator",
    ]);
    expect(payload.summaries.map((plan) => plan.id)).toEqual([
      "practice-1",
      "practice-5",
    ]);
  });

  it("treats a missed original occurrence as resolved once no pending or requeued work remains", () => {
    expect(isPracticeSessionResolved([
      { itemId: "one", status: "missed" },
      { itemId: "one", status: "correct" },
      { itemId: "two", status: "correct" },
    ])).toBe(true);
    expect(isPracticeSessionResolved([
      { itemId: "one", status: "missed" },
      { itemId: "one", status: "requeued" },
    ])).toBe(false);
    expect(isPracticeSessionResolved([{ itemId: "one", status: "missed" }])).toBe(false);
    expect(isPracticeSessionResolved([{ itemId: "one", status: "pending" }])).toBe(false);
    expect(isPracticeSessionResolved([])).toBe(false);
  });
});
