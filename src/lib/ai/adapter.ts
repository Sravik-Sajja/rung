// Single server-side AI integration boundary.
import type { HintLevel as LegacyHintLevel } from "@/lib/types";
import type { RungAiAdapter } from "@/lib/ai/contracts";
import { attemptVerificationFallback, getTutorHintFallback, mayaDiagnosisFallback } from "@/lib/ai/fixtures";
import { getMayaDiagnosisContent } from "@/lib/content/maya-fractions";
import { getWorkAnalysisFallback } from "@/lib/ai/runtime";
import { generatedPracticePlanFallback } from "@/lib/items/generated-practice-plan";
export { createAiAdapter, DEFAULT_AI_MODEL, getWorkAnalysisFallback, modelFor, readModelConfig, runtimeAiAdapter } from "@/lib/ai/runtime";

export const fallbackAiAdapter: RungAiAdapter = {
  async diagnoseExplanation(input) {
    const supported = new Set(input.supportedMisconceptionTags);
    const misconceptionTag = input.supportedMisconceptionTags.find((tag) => getMayaDiagnosisContent(tag))
      ?? (supported.has(mayaDiagnosisFallback.misconceptionTag) ? mayaDiagnosisFallback.misconceptionTag : input.supportedMisconceptionTags[0] ?? "unsupported_tag");
    const content = getMayaDiagnosisContent(misconceptionTag);
    return {
      ...mayaDiagnosisFallback,
      ...(content ?? {}),
      misconceptionTag,
      promptVersion: input.promptVersion,
    };
  },
  async tutorHint(input) {
    return { ...getTutorHintFallback(input.item, input.level), promptVersion: input.promptVersion };
  },
  async verifyAttempt(input) {
    return { ...attemptVerificationFallback, promptVersion: input.promptVersion };
  },
  async analyzeWork(input) {
    return {
      ...getWorkAnalysisFallback(input.imageDataUrl),
      source: "fallback",
      promptVersion: input.promptVersion,
      aiRunId: `fallback-work-analysis-${input.item.id}`,
      leakCheck: "fallback",
    };
  },
  async generatePracticePlan(input) {
    return {
      items: generatedPracticePlanFallback(input.targetSubskillId),
      source: "fallback",
      promptVersion: input.promptVersion,
      aiRunId: `fallback-practice-plan-${input.targetSubskillId}`,
    };
  },
  async generateTeacherLessonDraft(input) {
    return {
      objective: `Strengthen ${input.subskillName} through a short model-and-practice lesson.`,
      materials: ["Pencil", "Paper"],
      steps: [
        { minutes: 3, activity: `Warm up: name the key feature of ${input.subskillName}.` },
        { minutes: 6, activity: "Model one example and narrate each decision." },
        { minutes: 7, activity: "Pairs solve the matched practice problems and compare methods." },
        { minutes: 3, activity: "Independently solve one matched practice problem." },
      ],
      checkForUnderstanding: "Ask each learner to justify the method used on the final card.",
      source: "fallback",
      promptVersion: input.promptVersion,
      aiRunId: `fallback-teacher-lesson-${input.groupLabel}`,
    };
  },
  async wrapItem(input) {
    return { itemId: input.item.id, prompt: input.item.prompt, source: "fallback", promptVersion: input.promptVersion, aiRunId: `fallback-wrap-${input.item.id}` };
  },
};

/** Backward-compatible route helper. Keep API routes unchanged until contracts are formally wired. */
export async function getTutorHint(itemId: string, level: LegacyHintLevel) {
  const result = getTutorHintFallback(itemId, level);
  return { hint: result.hint, source: "fallback" as const };
}
