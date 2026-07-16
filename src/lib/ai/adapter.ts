// Single server-side AI integration boundary.
import type { HintLevel as LegacyHintLevel } from "@/lib/types";
import type { RungAiAdapter } from "@/lib/ai/contracts";
import { attemptVerificationFallback, getTutorHintFallback, mayaDiagnosisFallback } from "@/lib/ai/fixtures";
import { getMayaDiagnosisContent } from "@/lib/content/maya-fractions";
import { getWorkAnalysisFallback } from "@/lib/ai/runtime";
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
    return { ...getTutorHintFallback(input.item.id, input.level), promptVersion: input.promptVersion };
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
      items: [
        { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 },
        { kind: "fraction_operation", operation: "add", leftNumerator: 2, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
        { kind: "fraction_operation", operation: "subtract", leftNumerator: 3, leftDenominator: 4, rightNumerator: 1, rightDenominator: 3 },
        { kind: "fraction_operation", operation: "add", leftNumerator: 3, leftDenominator: 8, rightNumerator: 1, rightDenominator: 6 },
      ],
      source: "fallback",
      promptVersion: input.promptVersion,
      aiRunId: `fallback-practice-plan-${input.targetSubskillId}`,
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
