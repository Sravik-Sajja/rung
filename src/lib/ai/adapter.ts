// Single server-side AI integration boundary.
import type { HintLevel as LegacyHintLevel } from "@/lib/types";
import type { RungAiAdapter } from "@/lib/ai/contracts";
import { attemptVerificationFallback, mayaDiagnosisFallback, tutorHintFallbacks } from "@/lib/ai/fixtures";
export { createAiAdapter, DEFAULT_AI_MODEL, modelFor, readModelConfig, runtimeAiAdapter } from "@/lib/ai/runtime";

export const fallbackAiAdapter: RungAiAdapter = {
  async diagnoseExplanation(input) {
    const supported = new Set(input.supportedMisconceptionTags);
    return { ...mayaDiagnosisFallback, misconceptionTag: supported.has(mayaDiagnosisFallback.misconceptionTag) ? mayaDiagnosisFallback.misconceptionTag : input.supportedMisconceptionTags[0] ?? "unsupported_tag" };
  },
  async tutorHint(input) {
    return { ...tutorHintFallbacks[input.level], promptVersion: input.promptVersion };
  },
  async verifyAttempt(input) {
    return { ...attemptVerificationFallback, promptVersion: input.promptVersion };
  },
  async wrapItem(input) {
    return { itemId: input.item.id, prompt: input.item.prompt, source: "fallback", promptVersion: input.promptVersion, aiRunId: `fallback-wrap-${input.item.id}` };
  },
};

/** Backward-compatible route helper. Keep API routes unchanged until contracts are formally wired. */
export async function getTutorHint(_itemId: string, level: LegacyHintLevel) {
  const result = tutorHintFallbacks[level];
  return { hint: result.hint, source: "fallback" as const };
}
