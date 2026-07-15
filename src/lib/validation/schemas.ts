// Shared Zod request contracts for client-to-server mutation boundaries.
import { z } from "zod";

export const responseSchema = z.object({ studentId: z.string().min(1), itemId: z.string().min(1), answer: z.string().min(1), context: z.enum(["diagnostic", "practice"]), assignmentId: z.string().min(1).optional(), practiceSessionId: z.string().min(1).optional() });
export const hintSchema = z.object({ studentId: z.string(), itemId: z.string(), attempt: z.string(), level: z.enum(["nudge", "hint", "guided_step"]) });
export const peerAttemptSchema = z.object({ studentId: z.string(), itemId: z.string(), attemptText: z.string(), explanation: z.string() });
