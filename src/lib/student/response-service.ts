import { createClient } from "@supabase/supabase-js";
import { scoreAnswer } from "@/lib/math/scoring";
import type { Item, MasteryLevel } from "@/lib/types";

type DatabaseItem = { id: string; subskill_id: string; prompt: string; answer_spec: { accepted: string[] }; distractor_map: Record<string, string> };

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

function asItem(item: DatabaseItem): Item {
  return { id: item.id, subskillId: item.subskill_id, prompt: item.prompt, answerSpec: item.answer_spec, distractorMap: item.distractor_map };
}

export async function recordStudentResponse(input: { studentId: string; itemId: string; answer: string; context: "diagnostic" | "practice" }) {
  const supabase = client();
  if (!supabase) return null;
  const { data: item, error: itemError } = await supabase.from("items").select("id, subskill_id, prompt, answer_spec, distractor_map").eq("id", input.itemId).maybeSingle();
  if (itemError || !item) return { error: "Unknown item" };
  const isCorrect = scoreAnswer(asItem(item as DatabaseItem), input.answer);
  const { data: response, error: responseError } = await supabase.from("student_responses").insert({ student_id: input.studentId, item_id: input.itemId, answer_raw: input.answer.trim(), is_correct: isCorrect, context: input.context }).select("id").single();
  if (responseError) return { error: responseError.message };
  const { data: prior } = await supabase.from("mastery").select("evidence_count").eq("student_id", input.studentId).eq("subskill_id", item.subskill_id).maybeSingle();
  const evidenceCount = (prior?.evidence_count ?? 0) + 1;
  const level: MasteryLevel = isCorrect && evidenceCount >= 2 ? "mastered" : isCorrect ? "developing" : "needs_support";
  const evidenceSummary = isCorrect ? "Recorded a correct response." : "Recorded an incorrect response for follow-up practice.";
  const { error: masteryError } = await supabase.from("mastery").upsert({ student_id: input.studentId, subskill_id: item.subskill_id, level, evidence_count: evidenceCount, evidence_summary: evidenceSummary, last_evaluated_at: new Date().toISOString() }, { onConflict: "student_id,subskill_id" });
  if (masteryError) return { error: masteryError.message };
  return { isCorrect, responseId: response.id, level };
}
