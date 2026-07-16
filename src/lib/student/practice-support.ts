// Server-only resolver for tutor and work-help routes.
//
// Practice support is allowed only for an occurrence in a practice session the
// authenticated learner owns. This deliberately does not use the global demo
// generated-item map: generated content is meaningful only in its session.
import { createClient } from "@supabase/supabase-js";
import { getDemoSession } from "@/lib/student/demo-session-state";
import {
  claimDemoPracticeWorkHelp,
  recordDemoPracticeSupportHint,
  releaseDemoPracticeWorkHelpClaim,
} from "@/lib/student/demo-learning-store";
import type { ActorStore } from "@/lib/auth/actor";
import type { AnswerSpec, Item } from "@/lib/types";

export type PracticeSupportTarget = {
  studentId: string;
  practiceSessionId: string;
  practiceSessionItemId: string;
  store: ActorStore;
};

export type PracticeSupportResolution =
  | {
      status: "resolved";
      source: "demo" | "persisted";
      item: Item;
      /** Server-resolved only; never returned to a learner. */
      solutionSteps: string[];
      practiceSessionId: string;
      practiceSessionItemId: string;
      occurrenceStatus: "pending" | "missed" | "requeued";
    }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "unavailable" };

type DemoPracticeRun = {
  studentId: string;
  items: Array<{ id: string; item: Item; status: string }>;
};

type PersistedItem = {
  id: string;
  subskill_id: string;
  prompt: string;
  answer_spec: AnswerSpec;
  distractor_map: Record<string, string> | null;
  solution_steps: unknown;
};

function asItem(item: PersistedItem): Item {
  return {
    id: item.id,
    subskillId: item.subskill_id,
    prompt: item.prompt,
    answerSpec: item.answer_spec,
    distractorMap: item.distractor_map ?? {},
  };
}

function asSolutionSteps(value: unknown) {
  return Array.isArray(value)
    ? value.filter((step): step is string => typeof step === "string" && step.trim().length > 0)
    : [];
}

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function resolveDemoPracticeSupport(input: PracticeSupportTarget): PracticeSupportResolution {
  const run = getDemoSession<DemoPracticeRun>("practice", input.practiceSessionId);
  if (!run) return { status: "not_found" };
  if (run.studentId !== input.studentId) return { status: "forbidden" };

  const occurrence = run.items.find((entry) => entry.id === input.practiceSessionItemId);
  if (!occurrence || occurrence.status === "correct") return { status: "not_found" };

  return {
    status: "resolved",
    source: "demo",
    item: occurrence.item,
    solutionSteps: [],
    practiceSessionId: input.practiceSessionId,
    practiceSessionItemId: occurrence.id,
    occurrenceStatus: occurrence.status === "missed" ? "missed" : occurrence.status === "requeued" ? "requeued" : "pending",
  };
}

async function resolvePersistedPracticeSupport(input: PracticeSupportTarget): Promise<PracticeSupportResolution> {
  const client = configuredClient();
  if (!client) return { status: "unavailable" };

  const { data: session, error: sessionError } = await client
    .from("practice_sessions")
    .select("id, student_id")
    .eq("id", input.practiceSessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return { status: "not_found" };
  if (session.student_id !== input.studentId) return { status: "forbidden" };

  const { data: occurrence, error: occurrenceError } = await client
    .from("practice_session_items")
    .select("id, practice_session_id, status, items(id, subskill_id, prompt, answer_spec, distractor_map, solution_steps)")
    .eq("id", input.practiceSessionItemId)
    .eq("practice_session_id", input.practiceSessionId)
    .maybeSingle();
  if (occurrenceError) throw new Error(occurrenceError.message);

  const row = occurrence as unknown as {
    id: string;
    practice_session_id: string;
    status: string;
    items: PersistedItem | null;
  } | null;
  if (!row?.items || row.status === "correct") return { status: "not_found" };

  return {
    status: "resolved",
    source: "persisted",
    item: asItem(row.items),
    solutionSteps: asSolutionSteps(row.items.solution_steps),
    practiceSessionId: input.practiceSessionId,
    practiceSessionItemId: row.id,
    occurrenceStatus: row.status === "missed" ? "missed" : row.status === "requeued" ? "requeued" : "pending",
  };
}

/**
 * Resolves exactly one practice-session occurrence after the caller has been
 * authenticated. Demo and persisted stores are intentionally mutually
 * exclusive based on the storage boundary resolved by `requireStudentActor`.
 */
export async function resolvePracticeSupportItem(input: PracticeSupportTarget): Promise<PracticeSupportResolution> {
  return input.store === "local_demo"
    ? resolveDemoPracticeSupport(input)
    : resolvePersistedPracticeSupport(input);
}

export type ResolvedPracticeSupport = Extract<PracticeSupportResolution, { status: "resolved" }>;

export type PracticeSupportAction =
  | { status: "recorded" }
  | { status: "claimed"; claimId: string }
  | { status: "ineligible" }
  | { status: "unavailable" };

/**
 * Records every requested tutor level only after ownership + occurrence
 * resolution. The database procedure also verifies that the occurrence is
 * current, so a stale browser cannot manufacture an escalation sequence.
 */
export async function recordPracticeSupportHint(input: {
  resolution: ResolvedPracticeSupport;
  studentId: string;
  level: "nudge" | "hint" | "guided_step";
}): Promise<PracticeSupportAction> {
  if (input.resolution.source === "demo") {
    return recordDemoPracticeSupportHint({
      practiceSessionId: input.resolution.practiceSessionId,
      practiceSessionItemId: input.resolution.practiceSessionItemId,
      studentId: input.studentId,
      level: input.level,
    }) ? { status: "recorded" } : { status: "ineligible" };
  }

  const client = configuredClient();
  if (!client) return { status: "unavailable" };
  const { data, error } = await client.rpc("record_practice_support_hint", {
    p_practice_session_id: input.resolution.practiceSessionId,
    p_practice_session_item_id: input.resolution.practiceSessionItemId,
    p_student_id: input.studentId,
    p_level: input.level,
  });
  if (error) throw new Error(error.message);
  return data === true ? { status: "recorded" } : { status: "ineligible" };
}

/**
 * Reserves the single eligible work-help response before the AI call. A
 * matching release removes the reservation if that call fails, allowing a
 * retry without ever storing typed work or a photo.
 */
export async function claimPracticeWorkHelp(input: {
  resolution: ResolvedPracticeSupport;
  studentId: string;
}): Promise<PracticeSupportAction> {
  if (input.resolution.source === "demo") {
    const claimId = claimDemoPracticeWorkHelp({
      practiceSessionId: input.resolution.practiceSessionId,
      practiceSessionItemId: input.resolution.practiceSessionItemId,
      studentId: input.studentId,
    });
    return claimId ? { status: "claimed", claimId } : { status: "ineligible" };
  }

  const client = configuredClient();
  if (!client) return { status: "unavailable" };
  const { data, error } = await client.rpc("claim_practice_work_help", {
    p_practice_session_id: input.resolution.practiceSessionId,
    p_practice_session_item_id: input.resolution.practiceSessionItemId,
    p_student_id: input.studentId,
  });
  if (error) throw new Error(error.message);
  return typeof data === "string" && data.length > 0
    ? { status: "claimed", claimId: data }
    : { status: "ineligible" };
}

export async function releasePracticeWorkHelpClaim(input: {
  resolution: ResolvedPracticeSupport;
  studentId: string;
  claimId: string;
}) {
  if (input.resolution.source === "demo") {
    return releaseDemoPracticeWorkHelpClaim({
      practiceSessionId: input.resolution.practiceSessionId,
      practiceSessionItemId: input.resolution.practiceSessionItemId,
      studentId: input.studentId,
      claimId: input.claimId,
    });
  }

  const client = configuredClient();
  if (!client) return false;
  const { data, error } = await client.rpc("release_practice_work_help_claim", {
    p_claim_id: input.claimId,
    p_practice_session_id: input.resolution.practiceSessionId,
    p_student_id: input.studentId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}
