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

/**
 * The authoritative target for practice support. The server resolves the
 * item from this occurrence after it has authenticated the learner; clients
 * must never be trusted to choose an item by its catalog ID.
 */
export const practiceSupportTargetSchema = z.object({
  practiceSessionId: z.string().trim().min(1).max(128),
  practiceSessionItemId: z.string().trim().min(1).max(128),
});

/** The new, session-owned tutor-support request contract. */
export const tutorHintRequestSchema = z.object({
  studentId: z.string().trim().min(1).max(128),
  // Accepted only so older clients can upgrade without a coordinated deploy;
  // the server ignores it and resolves the occurrence itself.
  itemId: z.string().trim().min(1).max(128).optional(),
  attempt: z.string().max(4_000),
  level: z.enum(["nudge", "hint", "guided_step"]),
}).merge(practiceSupportTargetSchema).strict();

/**
 * Narrow compatibility contract for pre-session-aware student surfaces.
 * It is intentionally limited to a supplied seed-item ID; routes using it
 * must not resolve generated items or look in a global generated-item map.
 */
const legacyHintSchema = z.object({
  studentId: z.string().trim().min(1).max(128),
  itemId: z.string().trim().min(1).max(128),
  attempt: z.string().max(4_000),
  level: z.enum(["nudge", "hint", "guided_step"]),
}).strict();

/**
 * Transition parser while the independently-owned UI is wired to
 * `tutorHintRequestSchema`. A partial session target is always rejected.
 */
export const hintSchema = z.union([tutorHintRequestSchema, legacyHintSchema]);
export const peerAttemptSchema = z.object({ studentId: z.string(), itemId: z.string(), attemptText: z.string(), explanation: z.string() });

/**
 * The text fields for the multipart work-help request. The optional image is
 * validated by the route because Zod cannot safely inspect a platform File
 * object or enforce its byte size.
 */
const workHelpFieldsSchema = z.object({
  studentId: z.string().trim().min(1).max(128),
  writtenWork: z.string().trim().min(3, "Write a little about what you tried.").max(4_000),
  supportLevel: z.enum(["hint", "guided_step"]),
});

/** The new multipart work-help request contract. */
export const workHelpSupportFormSchema = workHelpFieldsSchema.extend({
  // The client may keep sending this during the rollout. It is never used to
  // choose support content in the session-owned path.
  itemId: z.string().trim().min(1).max(128).optional(),
}).merge(practiceSupportTargetSchema).strict();

/**
 * Like hints, allow only the old catalog-item shape during the UI handoff.
 * A caller cannot send one half of a session target to fall through to this
 * compatibility path.
 */
const legacyWorkHelpFormSchema = workHelpFieldsSchema.extend({
  itemId: z.string().trim().min(1).max(128),
}).strict();

export const workHelpFormSchema = z.union([workHelpSupportFormSchema, legacyWorkHelpFormSchema]);
