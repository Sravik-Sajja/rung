// Process-local credit guard for live model calls. It intentionally sits below
// route handlers so every feature using the runtime adapter gets the same cap.
import type { AiFeature } from "@/lib/ai/runtime";

type Window = { startedAt: number; count: number };
const windows = new Map<string, Window>();

const LIMITS: Record<AiFeature, { max: number; windowMs: number }> = {
  tutor_hint: { max: 60, windowMs: 10 * 60_000 },
  diagnosis_explanation: { max: 20, windowMs: 10 * 60_000 },
  practice_plan: { max: 24, windowMs: 15 * 60_000 },
  teacher_lesson: { max: 24, windowMs: 15 * 60_000 },
  work_analysis: { max: 30, windowMs: 10 * 60_000 },
  attempt_verification: { max: 60, windowMs: 10 * 60_000 },
  item_wrap: { max: 60, windowMs: 10 * 60_000 },
};

/** Returns false once an actor has spent its live-call allowance for a feature. Cached and deterministic responses remain available. */
export function allowLiveAiCall(feature: AiFeature, actorKey: string, now = Date.now()): boolean {
  const limit = LIMITS[feature];
  const key = `${feature}:${actorKey}`;
  const current = windows.get(key);
  if (!current || now - current.startedAt >= limit.windowMs) {
    windows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit.max) return false;
  current.count += 1;
  return true;
}

export function resetAiRateLimits() { windows.clear(); }
