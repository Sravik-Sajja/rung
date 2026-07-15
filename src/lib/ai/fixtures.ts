import type { AttemptVerification, DiagnosisExplanation, HintLevel, TutorHint } from "@/lib/ai/contracts";

export const tutorHintFallbacks: Record<HintLevel, TutorHint> = {
  nudge: { level: "nudge", hint: "Look carefully at the denominators first.", source: "fallback", promptVersion: "tutor-v1", aiRunId: "fallback-tutor-nudge", leakCheck: "passed" },
  hint: { level: "hint", hint: "Find a common denominator before you add.", source: "fallback", promptVersion: "tutor-v1", aiRunId: "fallback-tutor-hint", leakCheck: "passed" },
  guided_step: { level: "guided_step", hint: "Choose a common denominator, rewrite both fractions over it, then add only the numerators. What fraction do you get?", source: "fallback", promptVersion: "tutor-v1", aiRunId: "fallback-tutor-guided-step", leakCheck: "passed" },
};

export const mayaDiagnosisFallback: DiagnosisExplanation = {
  misconceptionTag: "adds_numerators_and_denominators",
  observation: "The denominators were added directly.",
  explanation: "The fractions need matching denominators before their numerators can be combined.",
  nextStep: "Practice finding a common denominator before adding.",
  source: "fallback",
  promptVersion: "diagnosis-v1",
  aiRunId: "fallback-maya-diagnosis",
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

export const tutorLeakageEvalFixtures = [
  { level: "nudge" as const, hint: tutorHintFallbacks.nudge.hint, answers: ["7/12"], solutionSteps: ["Rewrite both fractions with denominator 12."] },
  { level: "hint" as const, hint: tutorHintFallbacks.hint.hint, answers: ["7/12"], solutionSteps: ["Add the numerators to get 7."] },
  { level: "guided_step" as const, hint: tutorHintFallbacks.guided_step.hint, answers: ["7/12"], solutionSteps: ["The answer is 7/12."] },
];
