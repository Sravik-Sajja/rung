import { z } from "zod";

export const hintLevelSchema = z.enum(["nudge", "hint", "guided_step"]);
export type HintLevel = z.infer<typeof hintLevelSchema>;
export const aiSourceSchema = z.enum(["ai", "cache", "fallback"]);
export type AiSource = z.infer<typeof aiSourceSchema>;

export const safeItemSchema = z.object({
  id: z.string().min(1),
  subskillId: z.string().min(1),
  gradeBand: z.string().min(1),
  prompt: z.string().min(1),
  difficulty: z.number().int().positive(),
});
export type SafeItem = z.infer<typeof safeItemSchema>;

export const diagnosisEvidenceSchema = z.object({
  itemId: z.string().min(1),
  subskillId: z.string().min(1),
  misconceptionTag: z.string().min(1),
  selectedAnswer: z.string().min(1),
});
export type DiagnosisEvidence = z.infer<typeof diagnosisEvidenceSchema>;

const metaSchema = z.object({
  source: aiSourceSchema,
  promptVersion: z.string().min(1),
  aiRunId: z.string().min(1),
});

export const diagnosisExplanationSchema = metaSchema.extend({
  misconceptionTag: z.string().min(1),
  observation: z.string().min(1),
  explanation: z.string().min(1),
  nextStep: z.string().min(1),
});
export type DiagnosisExplanation = z.infer<typeof diagnosisExplanationSchema>;

export const tutorHintSchema = metaSchema.extend({
  level: hintLevelSchema,
  hint: z.string().min(1),
  leakCheck: z.enum(["passed", "fallback"]),
});
export type TutorHint = z.infer<typeof tutorHintSchema>;

/**
 * Private, server-derived context used only to reject unsafe tutor output.
 * It must never be included in a model message, cached payload, or ai_run.
 */
export const tutorHintProtectionSchema = z.object({
  protectedAnswers: z.array(z.string().trim().min(1).max(200)).min(1).max(16),
  protectedAnswerRule: z.object({
    kind: z.literal("positive_common_multiple"),
    denominators: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  }).optional(),
  protectedSolutionSteps: z.array(z.string().trim().min(1).max(500)).max(24),
});
export type TutorHintProtection = z.infer<typeof tutorHintProtectionSchema>;

/**
 * The tutor adapter receives a safe prompt item plus private leak-protection
 * data. Only the safe fields may cross the model/cache/ai_run boundary.
 */
export const tutorHintInputSchema = z.object({
  studentId: z.string().min(1),
  item: safeItemSchema,
  attempt: z.string().max(4_000),
  level: hintLevelSchema,
  promptVersion: z.string().min(1),
  protection: tutorHintProtectionSchema,
});
export type TutorHintInput = z.infer<typeof tutorHintInputSchema>;

export const attemptVerificationSchema = metaSchema.extend({
  onTopic: z.boolean(),
  nonTrivial: z.boolean(),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type AttemptVerification = z.infer<typeof attemptVerificationSchema>;

/**
 * A deliberately coarse signal so a photo can help a learner without turning
 * handwriting recognition into a source of scoring evidence.
 */
export const imageReadSchema = z.enum(["not_provided", "readable", "unclear"]);
export type ImageRead = z.infer<typeof imageReadSchema>;

/**
 * Low-stakes help after the learner is still stuck. The response is bounded to
 * one observation, one next step, and one check question; it never includes a
 * score, a final answer, or a worked solution.
 */
export const workAnalysisSchema = metaSchema.extend({
  observation: z.string().trim().min(1).max(280),
  nextStep: z.string().trim().min(1).max(280),
  checkQuestion: z.string().trim().min(1).max(200),
  imageRead: imageReadSchema,
  leakCheck: z.enum(["passed", "fallback"]),
});
export type WorkAnalysis = z.infer<typeof workAnalysisSchema>;

/**
 * The image is accepted only at the server-side adapter boundary. It is never
 * persisted to ai_runs; the runtime records only a one-way hash in its cache
 * key and safe structured output.
 */
export const analyzeWorkInputSchema = z.object({
  studentId: z.string().min(1),
  item: safeItemSchema,
  writtenWork: z.string().trim().min(1).max(4_000),
  imageDataUrl: z.string()
    // A 5 MiB binary upload expands to roughly 6.99 MiB as base64 plus its data-URL prefix.
    .max(7_100_000)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/, "Use a JPEG, PNG, or WebP image data URL.")
    .optional(),
  protectedAnswers: z.array(z.string().min(1).max(200)).min(1).max(16),
  protectedAnswerRule: z.object({
    kind: z.literal("positive_common_multiple"),
    denominators: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  }).optional(),
  protectedSolutionSteps: z.array(z.string().min(1).max(500)).max(24),
  promptVersion: z.string().min(1),
});
export type AnalyzeWorkInput = z.infer<typeof analyzeWorkInputSchema>;

export const answerSpecSchema = z.object({
  accepted: z.array(z.string().min(1)).min(1),
  rule: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("positive_common_multiple"),
      denominators: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    }),
    z.object({
      kind: z.literal("exact_denominator"),
      denominator: z.number().int().positive(),
    }),
  ]).optional(),
});

export const parametricItemSchema = z.object({
  id: z.string().min(1),
  subskillId: z.string().min(1),
  difficulty: z.number().int().positive(),
  prompt: z.string().min(1),
  answerSpec: answerSpecSchema,
  distractorMap: z.record(z.string()),
});
export type ParametricItem = z.infer<typeof parametricItemSchema>;

export const itemWrapSchema = metaSchema.extend({
  itemId: z.string().min(1),
  prompt: z.string().min(1),
});
export type ItemWrap = z.infer<typeof itemWrapSchema>;

const fractionOperationPlanItem = z.object({ kind: z.literal("fraction_operation"),
    operation: z.enum(["add", "subtract"]),
    leftNumerator: z.number().int().min(1).max(20),
    leftDenominator: z.number().int().min(2).max(20),
    rightNumerator: z.number().int().min(1).max(20),
    rightDenominator: z.number().int().min(2).max(20),
  });
const numberLinePlanItem = z.object({ kind: z.literal("number_line"), numerator: z.number().int().min(1).max(19), denominator: z.number().int().min(2).max(20) });
const equivalentFractionPlanItem = z.object({ kind: z.literal("equivalent_fraction"), numerator: z.number().int().min(1).max(10), denominator: z.number().int().min(2).max(12), multiplier: z.number().int().min(2).max(6) });
const commonDenominatorPlanItem = z.object({ kind: z.literal("common_denominator"), leftDenominator: z.number().int().min(2).max(12), rightDenominator: z.number().int().min(2).max(12) });
export const generatedPracticePlanSchema = metaSchema.extend({
  items: z.array(z.discriminatedUnion("kind", [fractionOperationPlanItem, numberLinePlanItem, equivalentFractionPlanItem, commonDenominatorPlanItem])).min(3).max(4),
});
export type GeneratedPracticePlan = z.infer<typeof generatedPracticePlanSchema>;

export interface RungAiAdapter {
  diagnoseExplanation(input: { studentId: string; assignmentId: string; gradeBand: string; targetSubskillId: string; supportedMisconceptionTags: string[]; evidence: DiagnosisEvidence[]; promptVersion: string }): Promise<DiagnosisExplanation>;
  tutorHint(input: TutorHintInput): Promise<TutorHint>;
  verifyAttempt(input: { studentId: string; item: SafeItem; attemptText: string; explanation: string; normalizedAttemptText: string; promptVersion: string }): Promise<AttemptVerification>;
  analyzeWork(input: AnalyzeWorkInput): Promise<WorkAnalysis>;
  generatePracticePlan(input: { studentId: string; targetSubskillId: string; misconceptionTags: string[]; promptVersion: string }): Promise<GeneratedPracticePlan>;
  wrapItem(input: { item: ParametricItem; promptVersion: string }): Promise<ItemWrap>;
}
