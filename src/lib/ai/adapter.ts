// Single server-side AI integration boundary; currently returns safe seeded fallbacks.
import type { HintLevel } from "@/lib/types";

// The sole future OpenAI boundary. It must validate structured output and log ai_runs.
export async function getTutorHint(_itemId: string, level: HintLevel) {
  const fallbacks = { nudge: "Look carefully at the denominators first.", hint: "Find a common denominator before you add.", guided_step: "What number is a multiple of both denominators?" };
  return { hint: fallbacks[level], source: "fallback" as const };
}
