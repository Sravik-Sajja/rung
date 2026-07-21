// Teacher matched practice uses the same constrained AI pipeline as student
// practice: the model proposes bounded parameters, then deterministic code
// validates them and creates the prompt plus server-owned answer specification.
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { materializeGeneratedPracticePlan } from "@/lib/items/generated-practice-plan";
import type { Item } from "@/lib/types";

const WORKSPACE_TARGET_BY_SUBSKILL: Record<string, string> = {
  "workspace-fraction-models": "equivalent-fractions",
  "workspace-equivalent-fractions": "equivalent-fractions",
  "workspace-compare-fractions": "fraction-number-line",
  "workspace-add-fractions": "add-unlike-denominators",
};

/** Maps temporary workspace skill IDs to the corresponding supported item generator. */
export function teacherPracticeTarget(subskillId: string) {
  return WORKSPACE_TARGET_BY_SUBSKILL[subskillId] ?? subskillId;
}

export async function generateTeacherMatchedPractice(input: {
  scopeId: string;
  subskillId: string;
}): Promise<Item[]> {
  const targetSubskillId = teacherPracticeTarget(input.subskillId);
  const generated = await runtimeAiAdapter.generatePracticePlan({
    // This only scopes caching/rate limiting for a teacher group; it is never
    // treated as a learner identity or written as student evidence.
    studentId: `teacher-group:${input.scopeId}`,
    targetSubskillId,
    misconceptionTags: ["shared-needs-support"],
    promptVersion: "teacher-matched-practice-v1",
  });
  return materializeGeneratedPracticePlan({
    targetSubskillId,
    items: generated.items,
    itemIdAt: (index) => `teacher-practice-${input.scopeId}-${index + 1}`,
  });
}
