import type { AttemptVerification, DiagnosisExplanation, HintLevel, SafeItem, TutorHint, TutorHintProtection } from "@/lib/ai/contracts";
import {
  mayaDiagnosisContent,
  mayaPracticeItemContent,
  mayaTutorHintLadders,
  type MayaPracticeItemId,
} from "@/lib/content/maya-fractions";
import type { Item } from "@/lib/types";

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

function generatedHintFallbacks(subskillId: string): Record<HintLevel, TutorHint> {
  const messages: Record<string, Record<HintLevel, string>> = {
    "fraction-number-line": {
      nudge: "How many equal parts divide the distance from zero to one?",
      hint: "A fraction on a number line names equal parts of one whole.",
      guided_step: "Partition the interval from zero to one into the denominator’s equal parts.",
    },
    "equivalent-fractions": {
      nudge: "What must change together to keep a fraction’s value the same?",
      hint: "Equivalent fractions use the same factor on the numerator and denominator.",
      guided_step: "Multiply the numerator and denominator by the same factor.",
    },
    "find-common-denominator": {
      nudge: "Which number could fit evenly into both denominator patterns?",
      hint: "A common denominator is divisible by both original denominators.",
      guided_step: "List multiples of each denominator until one number appears in both lists.",
    },
    "add-unlike-denominators": {
      nudge: "Can you add fractions before their pieces are the same size?",
      hint: "For unlike denominators, rewrite both fractions with one shared denominator before adding.",
      guided_step: "Choose a common denominator and rewrite each fraction without changing its value.",
    },
    "subtract-unlike-denominators": {
      nudge: "Can you subtract fractions before their pieces are the same size?",
      hint: "For unlike denominators, rewrite both fractions with one shared denominator before subtracting.",
      guided_step: "Choose a common denominator and rewrite each fraction without changing its value.",
    },
    generic: {
      nudge: "What do the denominators tell you about the size of each piece?",
      hint: "Use equal-sized parts before comparing or combining fractions.",
      guided_step: "Identify the denominator in each fraction.",
    },
  };
  const selected = messages[subskillId] ?? messages.generic;
  return Object.fromEntries(
    hintLevels.map((level) => [
      level,
      createTutorHintFallback(`generated-${subskillId}`, level, selected[level]),
    ]),
  ) as Record<HintLevel, TutorHint>;
}

/** Deterministic ladders for generated items, selected by their target skill. */
export const generatedTutorHintFallbacksBySubskill: Record<string, Record<HintLevel, TutorHint>> = Object.fromEntries(
  [
    "fraction-number-line",
    "equivalent-fractions",
    "find-common-denominator",
    "add-unlike-denominators",
    "subtract-unlike-denominators",
    "generic",
  ].map((subskillId) => [subskillId, generatedHintFallbacks(subskillId)]),
);

/**
 * Preserve reviewed Maya copy for fixed content. Generated items have no
 * reusable Maya ID, so their fallback is selected by the item’s own target
 * subskill instead of accidentally teaching common denominators every time.
 */
export function getTutorHintFallback(item: string | Pick<SafeItem, "id" | "subskillId">, level: HintLevel): TutorHint {
  const itemId = typeof item === "string" ? item : item.id;
  const itemSpecific = tutorHintFallbacksByItemAndLevel[itemId]?.[level];
  if (itemSpecific) return itemSpecific;
  if (typeof item === "string") return tutorHintFallbacks[level];
  return (generatedTutorHintFallbacksBySubskill[item.subskillId] ?? generatedTutorHintFallbacksBySubskill.generic)[level];
}

const generatedSolutionStepsBySubskill: Record<string, readonly string[]> = {
  "fraction-number-line": [
    "Divide the interval from zero to one into equal denominator-sized parts.",
    "Locate the numerator-th equal part.",
  ],
  "equivalent-fractions": [
    "Multiply the numerator and denominator by the same factor.",
    "Write the resulting equivalent fraction.",
  ],
  "find-common-denominator": [
    "List multiples of each denominator.",
    "Choose a number that appears in both lists.",
  ],
  "add-unlike-denominators": [
    "Find a common denominator.",
    "Rewrite both fractions before adding the numerators.",
  ],
  "subtract-unlike-denominators": [
    "Find a common denominator.",
    "Rewrite both fractions before subtracting the numerators.",
  ],
};

/**
 * Builds private leak-protection context from the server-resolved item. This
 * function is deliberately called by routes, never from a browser component.
 */
export function getTutorHintProtection(item: Item): TutorHintProtection {
  const mayaContent = mayaPracticeItemContent[item.id as MayaPracticeItemId];
  const rule = item.answerSpec.rule;
  return {
    protectedAnswers: [...item.answerSpec.accepted],
    // Only the common-multiple rule widens what counts as "the answer" (any multiple is one), so
    // only it needs protecting as a rule. An `exact_denominator` item's answers are already fully
    // covered by the literal `protectedAnswers` list above.
    protectedAnswerRule: rule?.kind === "positive_common_multiple"
      ? { kind: rule.kind, denominators: [rule.denominators[0], rule.denominators[1]] }
      : undefined,
    protectedSolutionSteps: mayaContent
      ? [...mayaContent.solutionSteps]
      : [...(generatedSolutionStepsBySubskill[item.subskillId] ?? [])],
  };
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
