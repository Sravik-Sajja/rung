import type { HintLevel } from "@/lib/ai/contracts";

/**
 * Reviewed, fictional content for the canonical Maya Chen demo journey.
 *
 * These assets are deliberately separate from scoring, unlocks, and UI state:
 * the server decides whether an approach or a full solution can be returned.
 * `approachText` is safe to reveal after a meaningful attempt; `fullSolution`
 * remains answer-bearing content for the correct-answer gate only.
 */
export const mayaPracticeItemContent = {
  "common-denominator-1": {
    answerValues: ["12"],
    solutionSteps: [
      "List multiples of 3 and multiples of 4.",
      "The first number in both lists is 12, so 12 is a common denominator.",
    ],
  },
  "common-denominator-2": {
    answerValues: ["15"],
    solutionSteps: [
      "List multiples of 5 and multiples of 3.",
      "The first number in both lists is 15, so 15 is a common denominator.",
    ],
  },
  "add-unlike-1": {
    answerValues: ["7/12"],
    solutionSteps: [
      "Use 12 as a common denominator.",
      "Rewrite 1/3 as 4/12 and 1/4 as 3/12.",
      "Add the numerators to get 7/12.",
    ],
  },
  "add-unlike-2": {
    answerValues: ["11/15"],
    solutionSteps: [
      "Use 15 as a common denominator.",
      "Rewrite 2/5 as 6/15 and 1/3 as 5/15.",
      "Add the numerators to get 11/15.",
    ],
  },
} as const;

export type MayaPracticeItemId = keyof typeof mayaPracticeItemContent;

export type MayaTutorHintLadder = Readonly<Record<HintLevel, string>>;

/**
 * Every rung advances the learner's next action without exposing the result,
 * an equivalent fraction, or a completed calculation.
 */
export const mayaTutorHintLadders: Readonly<Record<MayaPracticeItemId, MayaTutorHintLadder>> = {
  "common-denominator-1": {
    nudge: "What number might appear in both the 3-times table and the 4-times table?",
    hint: "Write a short list of multiples for 3 and another for 4. Look for the first number shared by both lists.",
    guided_step: "Make one column that counts by 3 and another that counts by 4. Compare the columns until a number appears in both.",
  },
  "common-denominator-2": {
    nudge: "What do you notice when you count by 5s and when you count by 3s?",
    hint: "Write a short list of multiples for 5 and another for 3. Look for the first number shared by both lists.",
    guided_step: "Make one column that counts by 5 and another that counts by 3. Compare the columns until a number appears in both.",
  },
  "add-unlike-1": {
    nudge: "Are thirds and fourths the same size of piece yet?",
    hint: "Choose a shared denominator before adding, then rename each fraction without changing its value.",
    guided_step: "Use your shared denominator. Multiply the top and bottom of each fraction by the same factor, then add the top numbers.",
  },
  "add-unlike-2": {
    nudge: "Do fifths and thirds name matching-sized pieces yet?",
    hint: "Choose a shared denominator before combining anything, then rename each fraction without changing its value.",
    guided_step: "Use your shared denominator. Multiply the top and bottom of each fraction by the same factor, then add the top numbers.",
  },
};

export function getMayaTutorHintLadder(itemId: string): MayaTutorHintLadder | null {
  return mayaTutorHintLadders[itemId as MayaPracticeItemId] ?? null;
}

/**
 * Copy rendered from already-selected deterministic diagnostic evidence.
 * These are the two supported error forms in the canonical Maya journey;
 * neither helper selects a tag or decides mastery.
 */
export const mayaDiagnosisContentByMisconception = {
  adds_denominators: {
    misconceptionTag: "adds_denominators",
    observation: "Your response combined denominators instead of looking for a shared denominator.",
    explanation: "Before adding fractions, first make the denominators match so both fractions name the same-sized pieces.",
    nextStep: "Practice finding a common denominator, then use it to add fractions.",
  },
  adds_numerators_and_denominators: {
    misconceptionTag: "adds_numerators_and_denominators",
    observation: "Your answer combined the fraction parts before the pieces were the same size.",
    explanation: "Before adding fractions, first make the denominators match so both fractions name the same-sized pieces.",
    nextStep: "Practice finding a common denominator, then use it to add fractions.",
  },
} as const;

export type MayaDiagnosisMisconceptionTag = keyof typeof mayaDiagnosisContentByMisconception;

export function getMayaDiagnosisContent(tag: string) {
  return mayaDiagnosisContentByMisconception[tag as MayaDiagnosisMisconceptionTag] ?? null;
}

/** Backward-compatible fallback for the original `2/7` diagnostic distractor. */
export const mayaDiagnosisContent = mayaDiagnosisContentByMisconception.adds_numerators_and_denominators;

export interface MayaPeerWorkedExample {
  id: string;
  itemId: MayaPracticeItemId;
  authorAlias: string;
  /** Safe after a meaningful, on-topic attempt; never contains the answer. */
  approachText: string;
  /** Answer-bearing, reviewed content for the deterministic correct-answer gate. */
  fullSolution: string;
  isVetted: true;
  reviewStatus: "reviewed";
  fictional: true;
}

/**
 * Curated fictional peers, not user-generated submissions. There are exactly
 * three demo-ready examples; each keeps the first move separate from the
 * complete worked solution so the peer gate can reveal them independently.
 */
export const mayaPeerWorkedExamples: readonly MayaPeerWorkedExample[] = [
  {
    id: "peer-common-denominator-1-alex",
    itemId: "common-denominator-1",
    authorAlias: "Alex",
    approachText: "I wrote multiples of each denominator in two columns and looked for the first number that appeared in both.",
    fullSolution: "For 3, the multiples include 3, 6, 9, and 12. For 4, the multiples include 4, 8, and 12. The first shared value is 12, so 12 is a common denominator.",
    isVetted: true,
    reviewStatus: "reviewed",
    fictional: true,
  },
  {
    id: "peer-common-denominator-2-riley",
    itemId: "common-denominator-2",
    authorAlias: "Riley",
    approachText: "I started by listing multiples of both denominators instead of adding the denominators together.",
    fullSolution: "For 5, the multiples include 5, 10, and 15. For 3, the multiples include 3, 6, 9, 12, and 15. The first shared value is 15, so 15 is a common denominator.",
    isVetted: true,
    reviewStatus: "reviewed",
    fictional: true,
  },
  {
    id: "peer-add-unlike-1-jordan",
    itemId: "add-unlike-1",
    authorAlias: "Jordan",
    approachText: "I noticed the denominators did not match, so I found a shared denominator before I tried to add.",
    fullSolution: "A common denominator is 12. Rewrite 1/3 as 4/12 and 1/4 as 3/12. Then add the numerators: 4/12 + 3/12 = 7/12.",
    isVetted: true,
    reviewStatus: "reviewed",
    fictional: true,
  },
] as const;

export function getMayaPeerWorkedExample(itemId: string): MayaPeerWorkedExample | null {
  return mayaPeerWorkedExamples.find((example) => example.itemId === itemId) ?? null;
}
