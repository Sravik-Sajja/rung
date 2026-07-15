import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { collectDiagnosticEvidence, nextMasteryLevel, selectDiagnosticGap, selectPracticeItems, shouldRequeue } from "@/lib/student/learning-loop";
import { scoreAnswer } from "@/lib/math/scoring";
import type { Item, MasteryLevel } from "@/lib/types";

type DbItem = { id: string; subskill_id: string; prompt: string; answer_spec: { accepted: string[] }; distractor_map: Record<string, string>; difficulty?: number | null };
type AssignmentItemRow = { position: number; items: DbItem | null };

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function asItem(item: DbItem): Item {
  return { id: item.id, subskillId: item.subskill_id, prompt: item.prompt, answerSpec: item.answer_spec, distractorMap: item.distractor_map ?? {} };
}

async function assignmentItems(client: NonNullable<ReturnType<typeof configuredClient>>, assignmentId: string) {
  const { data, error } = await client.from("assignment_items").select("position, items(id, subskill_id, prompt, answer_spec, distractor_map, difficulty)").eq("assignment_id", assignmentId).order("position");
  if (error) throw new Error(error.message);
  return (data as unknown as AssignmentItemRow[]).flatMap((row) => row.items ? [{ position: row.position, item: asItem(row.items) }] : []);
}

async function prerequisiteMap(client: NonNullable<ReturnType<typeof configuredClient>>) {
  const { data, error } = await client.from("subskills").select("id, prerequisite_subskill_id");
  if (error) throw new Error(error.message);
  return new Map((data as Array<{ id: string; prerequisite_subskill_id: string | null }>).map((row) => [row.id, row.prerequisite_subskill_id]));
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

export async function completePersistedDiagnostic(input: { diagnosticSessionId: string; studentId: string }) {
  const client = configuredClient();
  if (!client) return null;
  const { data: session, error: sessionError } = await client.from("diagnostic_sessions").select("assignment_id, student_id, status").eq("id", input.diagnosticSessionId).maybeSingle();
  if (sessionError || !session || session.student_id !== input.studentId || session.status !== "active") throw new Error("Diagnostic session is unavailable.");
  const administered = await assignmentItems(client, session.assignment_id);
  const { data: rawResponses, error: responseError } = await client.from("student_responses").select("item_id, answer_raw, is_correct, submitted_at").eq("diagnostic_session_id", input.diagnosticSessionId).order("submitted_at", { ascending: false });
  if (responseError) throw new Error(responseError.message);
  const latest = new Map<string, { answer: string; isCorrect: boolean }>();
  for (const response of rawResponses as Array<{ item_id: string; answer_raw: string; is_correct: boolean }>) {
    if (!latest.has(response.item_id)) latest.set(response.item_id, { answer: response.answer_raw, isCorrect: response.is_correct });
  }
  if (latest.size < administered.length) throw new Error("Complete every diagnostic item before continuing.");
  const prerequisites = await prerequisiteMap(client);
  const evidence = collectDiagnosticEvidence(administered.map((entry) => entry.item), latest);
  const gap = selectDiagnosticGap(evidence, prerequisites) ?? { subskillId: administered.at(-1)!.item.subskillId, misconceptionTag: null, evidence: [] };
  const { data: rawBank, error: bankError } = await client.from("items").select("id, subskill_id, prompt, answer_spec, distractor_map, difficulty").eq("is_active", true);
  if (bankError) throw new Error(bankError.message);
  const selected = selectPracticeItems((rawBank as DbItem[]).map(asItem), gap.subskillId, prerequisites, 4);
  if (selected.length < 4) throw new Error("The practice bank does not have four valid items for this diagnostic gap.");
  const practiceSessionId = `practice-${randomUUID()}`;
  const snapshot = { selectedSubskillId: gap.subskillId, misconceptionTag: gap.misconceptionTag, evidence: gap.evidence };
  const { error: practiceError } = await client.from("practice_sessions").insert({ id: practiceSessionId, student_id: input.studentId, topic_id: "fractions-rational-operations", status: "active", diagnosis_snapshot: snapshot });
  if (practiceError) throw new Error(practiceError.message);
  const { error: itemError } = await client.from("practice_session_items").insert(selected.map((item, index) => ({ practice_session_id: practiceSessionId, item_id: item.id, position: index + 1, status: "pending" })));
  if (itemError) throw new Error(itemError.message);
  const { error: completeError } = await client.from("diagnostic_sessions").update({ status: "complete", completed_at: new Date().toISOString() }).eq("id", input.diagnosticSessionId);
  if (completeError) throw new Error(completeError.message);
  return { diagnosis: { selectedSubskillId: gap.subskillId, misconceptionTag: gap.misconceptionTag ?? "no_recognized_distractor", evidence: gap.evidence, observation: "Your answers show that this skill is the next useful step.", explanation: "We will practice this prerequisite before moving to harder fraction problems.", nextStep: "Start the focused practice set.", explanationSource: "fallback" as "ai" | "cache" | "fallback" }, practiceSession: { id: practiceSessionId, status: "active" as const, firstItemId: selected[0].id, itemCount: selected.length } };
}

type PracticeRow = { id: string; item_id: string; position: number; status: "pending" | "missed" | "requeued" | "correct"; items: DbItem | null };

export async function getPersistedPractice(input: { practiceSessionId: string; studentId: string }) {
  const client = configuredClient();
  if (!client) return null;
  const { data: session, error: sessionError } = await client.from("practice_sessions").select("id, student_id, status").eq("id", input.practiceSessionId).maybeSingle();
  if (sessionError || !session || session.student_id !== input.studentId) throw new Error("Practice session is unavailable.");
  const { data, error } = await client.from("practice_session_items").select("id, item_id, position, status, items(id, subskill_id, prompt, answer_spec, distractor_map, difficulty)").eq("practice_session_id", input.practiceSessionId).order("position");
  if (error) throw new Error(error.message);
  const items = (data as unknown as PracticeRow[]).flatMap((row) => row.items ? [{ ...row, item: asItem(row.items) }] : []);
  const current = items.find((row) => row.status !== "correct") ?? null;
  return { session: { id: session.id, studentId: session.student_id, status: current ? "active" as const : "complete" as const, currentItemId: current?.item.id ?? null }, items: items.map((row) => ({ practiceSessionItemId: row.id, itemId: row.item.id, subskillId: row.item.subskillId, prompt: row.item.prompt, difficulty: row.items?.difficulty ?? 1, position: row.position, status: row.status, isResurfaced: row.status === "requeued", peerGate: { approachUnlocked: false, fullSolutionUnlocked: false } })) };
}

export async function recordPersistedPracticeResponse(input: { practiceSessionId: string; practiceSessionItemId: string; studentId: string; answer: string }) {
  const client = configuredClient();
  if (!client) return null;
  const { data: occurrence, error: occurrenceError } = await client.from("practice_session_items").select("id, item_id, status, items(id, subskill_id, prompt, answer_spec, distractor_map, difficulty)").eq("id", input.practiceSessionItemId).eq("practice_session_id", input.practiceSessionId).maybeSingle();
  const row = occurrence as unknown as { id: string; item_id: string; status: string; items: DbItem | null } | null;
  if (occurrenceError || !row?.items) throw new Error("Practice item is unavailable.");
  const item = asItem(row.items);
  const isCorrect = scoreAnswer(item, input.answer);
  const { data: statuses, error: statusesError } = await client.from("practice_session_items").select("status").eq("practice_session_id", input.practiceSessionId).eq("item_id", item.id);
  if (statusesError) throw new Error(statusesError.message);
  const shouldAddRequeue = !isCorrect && shouldRequeue((statuses as Array<{ status: string }>).map((entry) => entry.status));
  const { error: responseError } = await client.from("student_responses").insert({ student_id: input.studentId, item_id: item.id, answer_raw: input.answer.trim(), is_correct: isCorrect, context: "practice", practice_session_id: input.practiceSessionId });
  if (responseError) throw new Error(responseError.message);
  const { error: updateError } = await client.from("practice_session_items").update({ status: isCorrect ? "correct" : "missed" }).eq("id", row.id);
  if (updateError) throw new Error(updateError.message);
  if (shouldAddRequeue) {
    const { data: positions } = await client.from("practice_session_items").select("position").eq("practice_session_id", input.practiceSessionId).order("position", { ascending: false }).limit(1);
    const position = ((positions as Array<{ position: number }> | null)?.[0]?.position ?? 0) + 1;
    const { error } = await client.from("practice_session_items").insert({ practice_session_id: input.practiceSessionId, item_id: item.id, position, status: "requeued" });
    if (error) throw new Error(error.message);
  }
  const { data: prior } = await client.from("mastery").select("level, evidence_count").eq("student_id", input.studentId).eq("subskill_id", item.subskillId).maybeSingle();
  const { data: skill } = await client.from("subskills").select("prerequisite_subskill_id").eq("id", item.subskillId).maybeSingle();
  const prerequisiteId = (skill as { prerequisite_subskill_id?: string | null } | null)?.prerequisite_subskill_id;
  const { data: prerequisite } = prerequisiteId ? await client.from("mastery").select("level").eq("student_id", input.studentId).eq("subskill_id", prerequisiteId).maybeSingle() : { data: null };
  const next = nextMasteryLevel(((prior as { level?: MasteryLevel } | null)?.level ?? "not_started"), ((prior as { evidence_count?: number } | null)?.evidence_count ?? 0), isCorrect, (prerequisite as { level?: MasteryLevel } | null)?.level === "needs_support");
  const { error: masteryError } = await client.from("mastery").upsert({ student_id: input.studentId, subskill_id: item.subskillId, level: next.level, evidence_count: next.evidenceCount, evidence_summary: isCorrect ? "Recorded a correct focused-practice response." : "Recorded an incorrect response; this item will return once later.", last_evaluated_at: new Date().toISOString() }, { onConflict: "student_id,subskill_id" });
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
  return { studentId: input.studentId, topicId: input.topicId, skills: (skills as Array<{ id: string; name: string }>).map((skill) => {
    const record = bySkill.get(skill.id);
    const level = record?.level ?? "not_started";
    return { subskillId: skill.id, name: skill.name, level, message: record?.evidence_summary ?? "No evidence yet.", willComeBack: level !== "mastered" };
  }) };
}
