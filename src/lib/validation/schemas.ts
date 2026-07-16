// Shared Zod request contracts for client-to-server mutation boundaries.
import { z } from "zod";

export const responseSchema = z.discriminatedUnion("context", [
  z.object({
    studentId: z.string().min(1),
    itemId: z.string().min(1),
    answer: z.string().min(1),
    context: z.literal("diagnostic"),
    diagnosticSessionId: z.string().min(1),
    // Whether the student revealed a hint before answering. Drives extra reps of this subskill
    // in the follow-up practice set (see completeDemoDiagnostic).
    usedHint: z.boolean().optional(),
  }),
  z.object({
    studentId: z.string().min(1),
    itemId: z.string().min(1),
    answer: z.string().min(1),
    context: z.literal("practice"),
    practiceSessionId: z.string().min(1),
    practiceSessionItemId: z.string().min(1),
  }),
]);

export const hintSchema = z.object({ studentId: z.string(), itemId: z.string(), attempt: z.string(), level: z.enum(["nudge", "hint", "guided_step"]) });
export const peerAttemptSchema = z.object({ studentId: z.string(), itemId: z.string(), attemptText: z.string(), explanation: z.string() });
