import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { AiSource, GeneratedPracticePlan } from "@/lib/ai/contracts";
import { materializeGeneratedPracticePlan } from "@/lib/items/generated-practice-plan";
import { scoreAnswer } from "@/lib/math/scoring";
import { collectDiagnosticEvidence, nextMasteryLevel, selectDiagnosticGap, shouldRequeue, type DiagnosticEvidence } from "@/lib/student/learning-loop";
import type { AnswerSpec, Item, MasteryLevel } from "@/lib/types";

type DbItem = {
  id: string;
  subskill_id: string;
  prompt: string;
  answer_spec: AnswerSpec;
  distractor_map: Record<string, string> | null;
  difficulty?: number | null;
};
type AssignmentItemRow = { position: number; items: DbItem | null };
type ConfiguredClient = NonNullable<ReturnType<typeof configuredClient>>;

type PersistedCompletionRow = {
  diagnostic_session_id: string;
  selected_subskill_id: string;
  misconception_tag: string;
  evidence: unknown;
  observation: string;
  explanation: string;
  next_step: string;
  explanation_source: string;
};

type PersistedPlanRow = {
  id: string;
  target_subskill_id: string;
  title: string;
  reason: string;
  position: number;
};

type PersistedSessionRow = { id: string; status: string };
type PersistedPlanItemRow = { practice_session_id: string; item_id: string; position: number };

export type PracticePlanSummary = {
  /** Intentionally equal to the practice-session ID for route compatibility. */
  id: string;
  targetSubskillId: string;
  title: string;
  reason: string;
  itemCount: number;
  firstItemId: string;
  status: "active" | "complete";
};

type CompletionDiagnosis = {
  selectedSubskillId: string;
  misconceptionTag: string;
  evidence: DiagnosticEvidence[];
  observation: string;
  explanation: string;
  nextStep: string;
  explanationSource: AiSource;
};

export type PersistedDiagnosticCompletion = {
  diagnosis: CompletionDiagnosis;
  practiceSession: {
    id: string;
    status: "active" | "complete";
    firstItemId: string;
    itemCount: number;
  };
  practicePlans: PracticePlanSummary[];
};

export type PersistedDiagnosticPreparation = {
  kind: "prepared";
  diagnosticSessionId: string;
  studentId: string;
  assignmentId: string;
  diagnosis: CompletionDiagnosis;
  targets: Array<{ subskillId: string; misconceptionTag: string }>;
};

export type PersistedDiagnosticCompletionState =
  | { kind: "complete"; completion: PersistedDiagnosticCompletion }
  | PersistedDiagnosticPreparation;

export type GeneratedPersistedPlan = {
  targetSubskillId: string;
  misconceptionTag: string;
  title: string;
  reason: string;
  generationSource: AiSource;
  generationPromptVersion: string;
  generationAiRunRef?: string;
  items: GeneratedPracticePlan["items"];
};

type FinalizerItem = {
  id: string;
  itemType: "generated_practice";
  prompt: string;
  answerSpec: AnswerSpec;
  solutionSteps: string[];
  difficulty: number;
  distractorMap: Record<string, string>;
  parametricSpec: GeneratedPracticePlan["items"][number];
};

type FinalizerPlan = Omit<GeneratedPersistedPlan, "items"> & {
  id: string;
  validatorVersion: string;
  items: FinalizerItem[];
};

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function asItem(item: DbItem): Item {
  return {
    id: item.id,
    subskillId: item.subskill_id,
    prompt: item.prompt,
    answerSpec: item.answer_spec,
    distractorMap: item.distractor_map ?? {},
  };
}

async function assignmentItems(client: ConfiguredClient, assignmentId: string) {
  const { data, error } = await client
    .from("assignment_items")
    .select("position, items(id, subskill_id, prompt, answer_spec, distractor_map, difficulty)")
    .eq("assignment_id", assignmentId)
    .order("position");
  if (error) throw new Error(error.message);
  return (data as unknown as AssignmentItemRow[]).flatMap((row) => row.items ? [{ position: row.position, item: asItem(row.items) }] : []);
}

async function prerequisiteMap(client: ConfiguredClient) {
  const { data, error } = await client.from("subskills").select("id, prerequisite_subskill_id");
  if (error) throw new Error(error.message);
  return new Map((data as Array<{ id: string; prerequisite_subskill_id: string | null }>).map((row) => [row.id, row.prerequisite_subskill_id]));
}

function isPrerequisiteOf(candidate: string, skillId: string, prerequisites: ReadonlyMap<string, string | null>): boolean {
  let current = prerequisites.get(skillId) ?? null;
  while (current) {
    if (current === candidate) return true;
    current = prerequisites.get(current) ?? null;
  }
  return false;
}

/** Every missed skill gets its own plan. Dependencies remain first and ties retain diagnostic order. */
function orderedPracticeTargets(evidence: readonly DiagnosticEvidence[], prerequisites: ReadonlyMap<string, string | null>) {
  const firstMissBySkill = new Map<string, { subskillId: string; misconceptionTag: string; order: number }>();
  evidence.forEach((entry, order) => {
    if (entry.isCorrect || firstMissBySkill.has(entry.subskillId)) return;
    firstMissBySkill.set(entry.subskillId, {
      subskillId: entry.subskillId,
      misconceptionTag: entry.misconceptionTag ?? "needs-practice",
      order,
    });
  });
  return [...firstMissBySkill.values()]
    .sort((left, right) => {
      if (isPrerequisiteOf(left.subskillId, right.subskillId, prerequisites)) return -1;
      if (isPrerequisiteOf(right.subskillId, left.subskillId, prerequisites)) return 1;
      return left.order - right.order;
    })
    .map(({ subskillId, misconceptionTag }) => ({ subskillId, misconceptionTag }));
}

function asAiSource(value: string): AiSource {
  return value === "ai" || value === "cache" || value === "fallback" ? value : "fallback";
}

function asEvidence(value: unknown): DiagnosticEvidence[] {
  return Array.isArray(value) ? value as DiagnosticEvidence[] : [];
}

/**
 * A missed original occurrence is resolved only when another occurrence of
 * that same item is correct. This prevents a partial write (for example, a
 * failed requeue insert) from being presented as a completed practice session.
 */
export function isPracticeSessionResolved(occurrences: readonly { itemId: string; status: string }[]): boolean {
  if (!occurrences.length) return false;
  const statusesByItem = new Map<string, string[]>();
  for (const occurrence of occurrences) {
    statusesByItem.set(occurrence.itemId, [...(statusesByItem.get(occurrence.itemId) ?? []), occurrence.status]);
  }
  return [...statusesByItem.values()].every((statuses) => {
    if (statuses.some((status) => status === "pending" || status === "requeued")) return false;
    return !statuses.includes("missed") || statuses.includes("correct");
  });
}

function nextUnresolvedPracticeOccurrence<T extends { item_id: string; status: string }>(occurrences: readonly T[]): T | null {
  const correctItemIds = new Set(occurrences.filter((row) => row.status === "correct").map((row) => row.item_id));
  // A missed card intentionally remains current. The learner can request a
  // hint and retry the exact work before the queued fallback is shown.
  return occurrences.find((row) => row.status === "pending" || row.status === "requeued" || (row.status === "missed" && !correctItemIds.has(row.item_id))) ?? null;
}

async function readPersistedDiagnosticCompletion(client: ConfiguredClient, input: { diagnosticSessionId: string }): Promise<PersistedDiagnosticCompletion | null> {
  const { data: completionData, error: completionError } = await client
    .from("diagnostic_completions")
    .select("diagnostic_session_id, selected_subskill_id, misconception_tag, evidence, observation, explanation, next_step, explanation_source")
    .eq("diagnostic_session_id", input.diagnosticSessionId)
    .maybeSingle();
  if (completionError) throw new Error(completionError.message);
  if (!completionData) return null;

  const completion = completionData as PersistedCompletionRow;
  const { data: planData, error: planError } = await client
    .from("practice_plans")
    .select("id, target_subskill_id, title, reason, position")
    .eq("diagnostic_session_id", input.diagnosticSessionId)
    .order("position");
  if (planError) throw new Error(planError.message);
  const plans = (planData ?? []) as PersistedPlanRow[];
  if (!plans.length) throw new Error("Diagnostic completion is missing its practice plans.");

  const planIds = plans.map((plan) => plan.id);
  const [{ data: sessionData, error: sessionError }, { data: itemData, error: itemError }] = await Promise.all([
    client.from("practice_sessions").select("id, status").in("id", planIds),
    client.from("practice_session_items").select("practice_session_id, item_id, position").in("practice_session_id", planIds).order("position"),
  ]);
  if (sessionError) throw new Error(sessionError.message);
  if (itemError) throw new Error(itemError.message);

  const sessionById = new Map(((sessionData ?? []) as PersistedSessionRow[]).map((session) => [session.id, session]));
  const counts = new Map<string, number>();
  const firstItemByPlan = new Map<string, { itemId: string; position: number }>();
  for (const row of (itemData ?? []) as PersistedPlanItemRow[]) {
    counts.set(row.practice_session_id, (counts.get(row.practice_session_id) ?? 0) + 1);
    const current = firstItemByPlan.get(row.practice_session_id);
    if (!current || row.position < current.position) {
      firstItemByPlan.set(row.practice_session_id, { itemId: row.item_id, position: row.position });
    }
  }

  const practicePlans = plans.map((plan) => {
    const first = firstItemByPlan.get(plan.id);
    if (!first) throw new Error(`Practice plan ${plan.id} is missing generated items.`);
    return {
      id: plan.id,
      targetSubskillId: plan.target_subskill_id,
      title: plan.title,
      reason: plan.reason,
      itemCount: counts.get(plan.id) ?? 0,
      firstItemId: first.itemId,
      status: sessionById.get(plan.id)?.status === "complete" ? "complete" as const : "active" as const,
    };
  });
  const firstPlan = practicePlans[0];
  if (!firstPlan) throw new Error("Diagnostic completion is missing its first practice plan.");

  return {
    diagnosis: {
      selectedSubskillId: completion.selected_subskill_id,
      misconceptionTag: completion.misconception_tag,
      evidence: asEvidence(completion.evidence),
      observation: completion.observation,
      explanation: completion.explanation,
      nextStep: completion.next_step,
      explanationSource: asAiSource(completion.explanation_source),
    },
    practiceSession: {
      id: firstPlan.id,
      status: firstPlan.status,
      firstItemId: firstPlan.firstItemId,
      itemCount: firstPlan.itemCount,
    },
    practicePlans,
  };
}

export async function startPersistedDiagnostic(input: { studentId: string; assignmentId: string }) {
  const client = configuredClient();
  if (!client) return null;
  const items = await assignmentItems(client, input.assignmentId);
  if (!items.length) throw new Error("Diagnostic assignment has no items.");
  const { data: existing, error: existingError } = await client.from("diagnostic_sessions").select("id").eq("student_id", input.studentId).eq("assignment_id", input.assignmentId).eq("status", "active").maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const diagnosticSessionId = existing?.id ?? (await client.from("diagnostic_sessions").insert({ student_id: input.studentId, assignment_id: input.assignmentId, status: "active" }).select("id").single()).data?.id;
  if (!diagnosticSessionId) throw new Error("Could not create a diagnostic session.");
  return { diagnosticSessionId, assignmentId: input.assignmentId, items: items.map(({ position, item }) => ({ id: item.id, prompt: item.prompt, subskillId: item.subskillId, position })) };
}

export async function recordPersistedDiagnosticResponse(input: { diagnosticSessionId: string; studentId: string; itemId: string; answer: string }) {
  const client = configuredClient();
  if (!client) return null;
  const { data: session, error: sessionError } = await client.from("diagnostic_sessions").select("student_id, assignment_id, status").eq("id", input.diagnosticSessionId).maybeSingle();
  if (sessionError || !session || session.student_id !== input.studentId || session.status !== "active") throw new Error("Diagnostic session is unavailable.");
  const items = await assignmentItems(client, session.assignment_id);
  const item = items.find((entry) => entry.item.id === input.itemId)?.item;
  if (!item) throw new Error("Item is not part of this diagnostic.");
  const isCorrect = scoreAnswer(item, input.answer);
  const { data: response, error } = await client.from("student_responses").insert({ student_id: input.studentId, item_id: item.id, answer_raw: input.answer.trim(), is_correct: isCorrect, context: "diagnostic", diagnostic_session_id: input.diagnosticSessionId }).select("id").single();
  if (error) throw new Error(error.message);
  return { isCorrect, responseId: response.id };
}

/**
 * Reads a durable completion first. Otherwise returns deterministic evidence
 * and targets for the route-owned AI phase without creating any practice rows.
 */
export async function preparePersistedDiagnosticCompletion(input: { diagnosticSessionId: string; studentId: string }): Promise<PersistedDiagnosticCompletionState | null> {
  const client = configuredClient();
  if (!client) return null;
  const { data: session, error: sessionError } = await client
    .from("diagnostic_sessions")
    .select("assignment_id, student_id, status")
    .eq("id", input.diagnosticSessionId)
    .maybeSingle();
  if (sessionError || !session || session.student_id !== input.studentId) throw new Error("Diagnostic session is unavailable.");

  const existing = await readPersistedDiagnosticCompletion(client, input);
  if (existing) return { kind: "complete", completion: existing };
  if (session.status !== "active") {
    throw new Error("Diagnostic session is complete but its durable completion is unavailable.");
  }

  const administered = await assignmentItems(client, session.assignment_id);
  const { data: rawResponses, error: responseError } = await client
    .from("student_responses")
    .select("item_id, answer_raw, is_correct, submitted_at")
    .eq("diagnostic_session_id", input.diagnosticSessionId)
    .order("submitted_at", { ascending: false });
  if (responseError) throw new Error(responseError.message);
  const latest = new Map<string, { answer: string; isCorrect: boolean }>();
  for (const response of rawResponses as Array<{ item_id: string; answer_raw: string; is_correct: boolean }>) {
    if (!latest.has(response.item_id)) latest.set(response.item_id, { answer: response.answer_raw, isCorrect: response.is_correct });
  }
  if (latest.size < administered.length) throw new Error("Complete every diagnostic item before continuing.");

  const prerequisites = await prerequisiteMap(client);
  const evidence = collectDiagnosticEvidence(administered.map((entry) => entry.item), latest);
  const fallbackSkill = administered.at(-1)?.item.subskillId;
  if (!fallbackSkill) throw new Error("Diagnostic assignment has no items.");
  const gap = selectDiagnosticGap(evidence, prerequisites) ?? {
    subskillId: fallbackSkill,
    misconceptionTag: null,
    evidence: [],
  };
  const targets = orderedPracticeTargets(evidence, prerequisites);
  if (!targets.length) {
    targets.push({ subskillId: gap.subskillId, misconceptionTag: gap.misconceptionTag ?? "needs-practice" });
  }

  return {
    kind: "prepared",
    diagnosticSessionId: input.diagnosticSessionId,
    studentId: input.studentId,
    assignmentId: session.assignment_id,
    diagnosis: {
      selectedSubskillId: gap.subskillId,
      misconceptionTag: gap.misconceptionTag ?? "no_recognized_distractor",
      evidence: gap.evidence,
      observation: "Your answers show that this skill is the next useful step.",
      explanation: "We will practice this prerequisite before moving to harder fraction problems.",
      nextStep: "Start the focused practice set.",
      explanationSource: "fallback",
    },
    targets,
  };
}

function solutionStepsFor(item: GeneratedPracticePlan["items"][number]): string[] {
  switch (item.kind) {
    case "number_line":
      return ["Split the space from 0 to 1 into equal parts.", "Count the numerator number of parts from zero."];
    case "equivalent_fraction":
      return ["Multiply the numerator and denominator by the same number."];
    case "common_denominator":
      return ["List multiples of each denominator and identify a number they share."];
    case "fraction_operation":
      return ["Find a common denominator.", "Rewrite both fractions with that denominator.", `${item.operation === "add" ? "Add" : "Subtract"} the numerators and simplify.`];
  }
}

function defaultGeneratedId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/**
 * Produces the exact, server-only JSON accepted by the atomic finalizer RPC.
 * The central materializer validates every plan and derives prompt/answer data
 * before anything can be persisted.
 */
export function buildPersistedGeneratedPlanPayload(input: {
  plans: readonly GeneratedPersistedPlan[];
  idFor?: (prefix: "practice" | "generated-practice") => string;
}): { plans: FinalizerPlan[]; summaries: PracticePlanSummary[] } {
  const idFor = input.idFor ?? defaultGeneratedId;
  const plans = input.plans.map((plan) => {
    const planId = idFor("practice");
    const materialized = materializeGeneratedPracticePlan({
      targetSubskillId: plan.targetSubskillId,
      items: plan.items,
      itemIdAt: () => idFor("generated-practice"),
      difficultyAt: (index) => index + 1,
    });
    const finalizerItems = materialized.map((item, index) => ({
      id: item.id,
      itemType: "generated_practice" as const,
      prompt: item.prompt,
      answerSpec: item.answerSpec,
      solutionSteps: solutionStepsFor(plan.items[index]),
      difficulty: index + 1,
      distractorMap: item.distractorMap,
      parametricSpec: plan.items[index],
    }));
    return {
      ...plan,
      id: planId,
      validatorVersion: "generated-practice-v1",
      items: finalizerItems,
    } satisfies FinalizerPlan;
  });
  const summaries = plans.map((plan) => ({
    id: plan.id,
    targetSubskillId: plan.targetSubskillId,
    title: plan.title,
    reason: plan.reason,
    itemCount: plan.items.length,
    firstItemId: plan.items[0]!.id,
    status: "active" as const,
  }));
  return { plans, summaries };
}

/** Finalizes once in Supabase, then re-reads canonical rows for retry-safe output. */
export async function finalizePersistedDiagnosticCompletion(input: {
  preparation: PersistedDiagnosticPreparation;
  narrative: Pick<CompletionDiagnosis, "observation" | "explanation" | "nextStep" | "explanationSource"> & { explanationAiRunRef?: string };
  plans: readonly GeneratedPersistedPlan[];
}): Promise<PersistedDiagnosticCompletion> {
  const client = configuredClient();
  if (!client) throw new Error("Supabase persistence is unavailable.");

  const existing = await readPersistedDiagnosticCompletion(client, input.preparation);
  if (existing) return existing;
  if (input.plans.length !== input.preparation.targets.length) {
    throw new Error("Generated practice plans do not match the diagnostic targets.");
  }
  const targets = new Set(input.preparation.targets.map((target) => target.subskillId));
  const generatedTargets = new Set(input.plans.map((plan) => plan.targetSubskillId));
  if (generatedTargets.size !== targets.size || input.plans.some((plan) => !targets.has(plan.targetSubskillId))) {
    throw new Error("Generated practice plan targeted an unsupported skill.");
  }

  const generated = buildPersistedGeneratedPlanPayload({ plans: input.plans });
  const completionPayload = {
    selectedSubskillId: input.preparation.diagnosis.selectedSubskillId,
    misconceptionTag: input.preparation.diagnosis.misconceptionTag,
    evidence: input.preparation.diagnosis.evidence,
    observation: input.narrative.observation,
    explanation: input.narrative.explanation,
    nextStep: input.narrative.nextStep,
    explanationSource: input.narrative.explanationSource,
    explanationAiRunRef: input.narrative.explanationAiRunRef,
    completionVersion: "diagnostic-completion-v1",
  };
  const { error } = await client.rpc("finalize_generated_diagnostic_completion", {
    p_diagnostic_session_id: input.preparation.diagnosticSessionId,
    p_student_id: input.preparation.studentId,
    p_completion: completionPayload,
    p_plans: generated.plans,
  });
  if (error) throw new Error(error.message);

  const durable = await readPersistedDiagnosticCompletion(client, input.preparation);
  if (!durable) throw new Error("Generated practice completion was not persisted.");
  return durable;
}

type PracticeRow = {
  id: string;
  item_id: string;
  position: number;
  status: "pending" | "missed" | "requeued" | "correct";
  items: DbItem | null;
};

export async function getPersistedPractice(input: { practiceSessionId: string; studentId: string }) {
  const client = configuredClient();
  if (!client) return null;
  const { data: session, error: sessionError } = await client.from("practice_sessions").select("id, student_id, status").eq("id", input.practiceSessionId).maybeSingle();
  if (sessionError || !session || session.student_id !== input.studentId) throw new Error("Practice session is unavailable.");
  const { data, error } = await client.from("practice_session_items").select("id, item_id, position, status, items(id, subskill_id, prompt, answer_spec, distractor_map, difficulty)").eq("practice_session_id", input.practiceSessionId).order("position");
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as unknown as PracticeRow[]).flatMap((row) => row.items ? [{ ...row, item: asItem(row.items) }] : []);
  const current = nextUnresolvedPracticeOccurrence(items);
  const complete = session.status === "complete" || !current;
  return {
    session: {
      id: session.id,
      studentId: session.student_id,
      status: complete ? "complete" as const : "active" as const,
      currentItemId: current?.item.id ?? null,
    },
    items: items.map((row) => ({
      practiceSessionItemId: row.id,
      itemId: row.item.id,
      subskillId: row.item.subskillId,
      prompt: row.item.prompt,
      difficulty: row.items?.difficulty ?? 1,
      position: row.position,
      status: row.status,
      isResurfaced: row.status === "requeued",
      peerGate: { approachUnlocked: false, fullSolutionUnlocked: false },
    })),
  };
}

export async function recordPersistedPracticeResponse(input: { practiceSessionId: string; practiceSessionItemId: string; studentId: string; answer: string }) {
  const client = configuredClient();
  if (!client) return null;
  const { data: session, error: sessionError } = await client
    .from("practice_sessions")
    .select("student_id, status")
    .eq("id", input.practiceSessionId)
    .maybeSingle();
  if (sessionError || !session || session.student_id !== input.studentId || session.status === "complete") {
    throw new Error("Practice session is unavailable.");
  }

  const { data: occurrence, error: occurrenceError } = await client
    .from("practice_session_items")
    .select("id, item_id, status, items(id, subskill_id, prompt, answer_spec, distractor_map, difficulty)")
    .eq("id", input.practiceSessionItemId)
    .eq("practice_session_id", input.practiceSessionId)
    .maybeSingle();
  const row = occurrence as unknown as { id: string; item_id: string; status: string; items: DbItem | null } | null;
  if (occurrenceError || !row?.items || (row.status !== "pending" && row.status !== "requeued" && row.status !== "missed")) {
    throw new Error("Practice item is unavailable.");
  }

  const { data: currentRows, error: currentError } = await client
    .from("practice_session_items")
    .select("id, item_id, status")
    .eq("practice_session_id", input.practiceSessionId)
    .order("position");
  if (currentError) throw new Error(currentError.message);
  const current = nextUnresolvedPracticeOccurrence((currentRows ?? []) as Array<{ id: string; item_id: string; status: string }>);
  if (current?.id !== row.id) throw new Error("Practice item is not the current occurrence.");

  const item = asItem(row.items);
  const isCorrect = scoreAnswer(item, input.answer);
  const { data: statuses, error: statusesError } = await client
    .from("practice_session_items")
    .select("status")
    .eq("practice_session_id", input.practiceSessionId)
    .eq("item_id", item.id);
  if (statusesError) throw new Error(statusesError.message);
  const shouldAddRequeue = !isCorrect && shouldRequeue((statuses as Array<{ status: string }>).map((entry) => entry.status));

  const { error: responseError } = await client.from("student_responses").insert({
    student_id: input.studentId,
    item_id: item.id,
    answer_raw: input.answer.trim(),
    is_correct: isCorrect,
    context: "practice",
    practice_session_id: input.practiceSessionId,
    practice_session_item_id: row.id,
  });
  if (responseError) throw new Error(responseError.message);
  const { error: updateError } = await client
    .from("practice_session_items")
    .update({ status: isCorrect ? "correct" : "missed" })
    .eq("id", row.id);
  if (updateError) throw new Error(updateError.message);

  if (isCorrect) {
    // The original missed occurrence stays visible for a real retry. Once it
    // is solved, discard any untouched automatic requeue for the same item so
    // a stale duplicate cannot block completion or become a fake extra task.
    const { error: cleanupError } = await client
      .from("practice_session_items")
      .delete()
      .eq("practice_session_id", input.practiceSessionId)
      .eq("item_id", item.id)
      .neq("id", row.id)
      .in("status", ["pending", "requeued"]);
    if (cleanupError) throw new Error(cleanupError.message);
  }

  if (shouldAddRequeue) {
    const { data: positions, error: positionError } = await client
      .from("practice_session_items")
      .select("position")
      .eq("practice_session_id", input.practiceSessionId)
      .order("position", { ascending: false })
      .limit(1);
    if (positionError) throw new Error(positionError.message);
    const position = ((positions as Array<{ position: number }> | null)?.[0]?.position ?? 0) + 1;
    const { error } = await client
      .from("practice_session_items")
      .insert({ practice_session_id: input.practiceSessionId, item_id: item.id, position, status: "requeued" });
    if (error) throw new Error(error.message);
  }

  const { data: allStatuses, error: allStatusesError } = await client
    .from("practice_session_items")
    .select("item_id, status")
    .eq("practice_session_id", input.practiceSessionId);
  if (allStatusesError) throw new Error(allStatusesError.message);
  if (isPracticeSessionResolved(((allStatuses ?? []) as Array<{ item_id: string; status: string }>).map((entry) => ({ itemId: entry.item_id, status: entry.status })))) {
    const { error: completionError } = await client
      .from("practice_sessions")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", input.practiceSessionId);
    if (completionError) throw new Error(completionError.message);
  }

  const { data: prior } = await client.from("mastery").select("level, evidence_count").eq("student_id", input.studentId).eq("subskill_id", item.subskillId).maybeSingle();
  const { data: skill } = await client.from("subskills").select("prerequisite_subskill_id").eq("id", item.subskillId).maybeSingle();
  const prerequisiteId = (skill as { prerequisite_subskill_id?: string | null } | null)?.prerequisite_subskill_id;
  const { data: prerequisite } = prerequisiteId ? await client.from("mastery").select("level").eq("student_id", input.studentId).eq("subskill_id", prerequisiteId).maybeSingle() : { data: null };
  const next = nextMasteryLevel(
    ((prior as { level?: MasteryLevel } | null)?.level ?? "not_started"),
    ((prior as { evidence_count?: number } | null)?.evidence_count ?? 0),
    isCorrect,
    (prerequisite as { level?: MasteryLevel } | null)?.level === "needs_support",
  );
  const { error: masteryError } = await client.from("mastery").upsert({
    student_id: input.studentId,
    subskill_id: item.subskillId,
    level: next.level,
    evidence_count: next.evidenceCount,
    evidence_summary: isCorrect ? "Recorded a correct focused-practice response." : "Recorded an incorrect response; this item will return once later.",
    last_evaluated_at: new Date().toISOString(),
  }, { onConflict: "student_id,subskill_id" });
  if (masteryError) throw new Error(masteryError.message);

  const practice = await getPersistedPractice({ practiceSessionId: input.practiceSessionId, studentId: input.studentId });
  return { isCorrect, masteryLevel: next.level, fullSolutionUnlocked: isCorrect, practice };
}

export async function getPersistedStudentMastery(input: { studentId: string; topicId: string }) {
  const client = configuredClient();
  if (!client) return null;
  const { data: skills, error: skillError } = await client.from("subskills").select("id, name").eq("topic_id", input.topicId);
  if (skillError) throw new Error(skillError.message);
  const skillIds = (skills as Array<{ id: string; name: string }>).map((skill) => skill.id);
  const { data: records, error: masteryError } = await client.from("mastery").select("subskill_id, level, evidence_summary").eq("student_id", input.studentId).in("subskill_id", skillIds);
  if (masteryError) throw new Error(masteryError.message);
  const bySkill = new Map((records as Array<{ subskill_id: string; level: MasteryLevel; evidence_summary: string | null }>).map((record) => [record.subskill_id, record]));
  return {
    studentId: input.studentId,
    topicId: input.topicId,
    skills: (skills as Array<{ id: string; name: string }>).map((skill) => {
      const record = bySkill.get(skill.id);
      const level = record?.level ?? "not_started";
      return {
        subskillId: skill.id,
        name: skill.name,
        level,
        message: record?.evidence_summary ?? "No evidence yet.",
        willComeBack: level !== "mastered",
      };
    }),
  };
}
