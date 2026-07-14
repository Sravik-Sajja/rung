// Maps known wrong-answer distractors to auditable, seeded misconception evidence.
import type { Diagnosis, Item } from "@/lib/types";

export function diagnoseResponse(item: Item, answer: string): Diagnosis | null {
  const tag = item.distractorMap[answer.trim()];
  if (!tag) return null;
  return { subskillId: item.subskillId, misconceptionTag: tag, observation: "The denominators were added directly.", nextStep: "Practice finding a common denominator before adding." };
}
