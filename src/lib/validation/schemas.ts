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

export const hintSchema = z.object({ studentId: z.string(), itemId: z.string(), practiceSessionId: z.string().optional(), attempt: z.string(), level: z.enum(["nudge", "hint", "guided_step"]) });
export const peerAttemptSchema = z.object({ studentId: z.string(), itemId: z.string(), attemptText: z.string(), explanation: z.string() });

/**
 * The text fields for the multipart work-help request. The optional image is
 * validated by the route because Zod cannot safely inspect a platform File
 * object or enforce its byte size.
 */
export const workHelpFormSchema = z.object({
  studentId: z.string().trim().min(1).max(128),
  itemId: z.string().trim().min(1).max(128),
  writtenWork: z.string().trim().min(3, "Write a little about what you tried.").max(4_000),
  supportLevel: z.enum(["hint", "guided_step"]),
});
