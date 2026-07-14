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

export const attemptVerificationSchema = metaSchema.extend({
  onTopic: z.boolean(),
  nonTrivial: z.boolean(),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type AttemptVerification = z.infer<typeof attemptVerificationSchema>;

export const parametricItemSchema = z.object({
  id: z.string().min(1),
  subskillId: z.string().min(1),
  difficulty: z.number().int().positive(),
  prompt: z.string().min(1),
  answerSpec: z.object({ accepted: z.array(z.string().min(1)).min(1) }),
  distractorMap: z.record(z.string()),
});
export type ParametricItem = z.infer<typeof parametricItemSchema>;

export const itemWrapSchema = metaSchema.extend({
  itemId: z.string().min(1),
  prompt: z.string().min(1),
});
export type ItemWrap = z.infer<typeof itemWrapSchema>;

export interface RungAiAdapter {
  diagnoseExplanation(input: { studentId: string; assignmentId: string; gradeBand: string; targetSubskillId: string; supportedMisconceptionTags: string[]; evidence: DiagnosisEvidence[]; promptVersion: string }): Promise<DiagnosisExplanation>;
  tutorHint(input: { studentId: string; item: SafeItem; attempt: string; level: HintLevel; promptVersion: string }): Promise<TutorHint>;
  verifyAttempt(input: { studentId: string; item: SafeItem; attemptText: string; explanation: string; normalizedAttemptText: string; promptVersion: string }): Promise<AttemptVerification>;
  wrapItem(input: { item: ParametricItem; promptVersion: string }): Promise<ItemWrap>;
}
