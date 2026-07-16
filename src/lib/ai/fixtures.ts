import type { AttemptVerification, DiagnosisExplanation, HintLevel, TutorHint } from "@/lib/ai/contracts";
import {
  mayaDiagnosisContent,
  mayaPracticeItemContent,
  mayaTutorHintLadders,
  type MayaPracticeItemId,
} from "@/lib/content/maya-fractions";

const hintLevels: readonly HintLevel[] = ["nudge", "hint", "guided_step"];
const mayaPracticeItemIds = Object.keys(mayaPracticeItemContent) as MayaPracticeItemId[];

function createTutorHintFallback(itemId: string, level: HintLevel, hint: string): TutorHint {
  return {
    level,
    hint,
    source: "fallback",
    promptVersion: "tutor-v2-maya-fractions",
    aiRunId: `fallback-tutor-${itemId}-${level}`,
    leakCheck: "passed",
  };
}

/**
 * Frozen, item-specific fallbacks for Maya's rehearsal journey. The adapter's
 * existing generic contract remains intact; callers can opt into this map by
 * item ID when they have one.
 */
export const tutorHintFallbacksByItemAndLevel: Record<string, Record<HintLevel, TutorHint>> = Object.fromEntries(
  mayaPracticeItemIds.map((itemId) => [
    itemId,
    Object.fromEntries(
      hintLevels.map((level) => [
        level,
        createTutorHintFallback(itemId, level, mayaTutorHintLadders[itemId][level]),
      ]),
    ) as Record<HintLevel, TutorHint>,
  ]),
);

/**
 * Backward-compatible safe fallback for adapter callers that have not yet
 * supplied an item-specific cache key. It is the first common-denominator
 * rung in Maya's canonical journey.
 */
export const tutorHintFallbacks: Record<HintLevel, TutorHint> = tutorHintFallbacksByItemAndLevel["common-denominator-1"];

export function getTutorHintFallback(itemId: string, level: HintLevel): TutorHint {
  return tutorHintFallbacksByItemAndLevel[itemId]?.[level] ?? tutorHintFallbacks[level];
}

export const mayaDiagnosisFallback: DiagnosisExplanation = {
  ...mayaDiagnosisContent,
  source: "fallback",
  promptVersion: "diagnosis-v2-maya-fractions",
  aiRunId: "fallback-maya-common-denominator-diagnosis",
};

export const attemptVerificationFallback: AttemptVerification = {
  onTopic: false,
  nonTrivial: false,
  reason: "Tell us which denominators you considered and what you tried next.",
  confidence: 0,
  source: "fallback",
  promptVersion: "attempt-v1",
  aiRunId: "fallback-attempt",
};

/**
 * Eval corpus for the full Maya ladder. `solutionSteps` intentionally hold
 * the protected, answer-bearing content so leakage tests guard more than the
 * final answer string alone.
 */
export const tutorLeakageEvalFixtures = mayaPracticeItemIds.flatMap((itemId) =>
  hintLevels.map((level) => ({
    itemId,
    level,
    hint: mayaTutorHintLadders[itemId][level],
    answers: mayaPracticeItemContent[itemId].answerValues,
    solutionSteps: mayaPracticeItemContent[itemId].solutionSteps,
  })),
);
