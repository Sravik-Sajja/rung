// Maps known wrong-answer distractors to auditable, seeded misconception evidence.
import type { Diagnosis, Item } from "@/lib/types";
import type { DiagnosticResponse } from "@/lib/student/diagnostic-store";

export function diagnoseResponse(item: Item, answer: string): Diagnosis | null {
  const tag = item.distractorMap[answer.trim()];
  if (!tag) return null;
  return { subskillId: item.subskillId, misconceptionTag: tag, observation: "The denominators were added directly.", nextStep: "Practice finding a common denominator before adding." };
}

export interface PriorityGap {
  item: Item;
  response: DiagnosticResponse;
}

/**
 * Picks the single gap to surface after a multi-item diagnostic. `items` must be passed in
 * prerequisite-first order (the order they were administered in): the earliest incorrect response
 * is the priority gap, since it likely underlies the harder skills that follow it. A misconception
 * tag, when present on that response, enriches the observation but never re-orders selection — an
 * earlier untagged miss (a missing prerequisite) must not be skipped for a later tagged one.
 * Returns null when every response was correct (no gap to report) or when there are no responses.
 */
export function selectPriorityGap(items: Item[], responses: DiagnosticResponse[]): PriorityGap | null {
  const byItemId = new Map(responses.map((response) => [response.itemId, response] as const));
  const incorrect = items
    .map((item) => ({ item, response: byItemId.get(item.id) }))
    .filter((entry): entry is PriorityGap => Boolean(entry.response) && entry.response!.isCorrect === false);

  if (incorrect.length === 0) return null;
  return incorrect[0];
}
