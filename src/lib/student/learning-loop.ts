import { normalizeFraction } from "@/lib/math/scoring";
import type { Item, MasteryLevel } from "@/lib/types";

export interface DiagnosticEvidence {
  itemId: string;
  subskillId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  misconceptionTag: string | null;
}

export interface DiagnosticGap {
  subskillId: string;
  misconceptionTag: string | null;
  evidence: DiagnosticEvidence[];
}

export function collectDiagnosticEvidence(items: readonly Item[], answersByItemId: ReadonlyMap<string, { answer: string; isCorrect: boolean }>): DiagnosticEvidence[] {
  return items.flatMap((item) => {
    const response = answersByItemId.get(item.id);
    if (!response) return [];
    const selectedAnswer = normalizeFraction(response.answer);
    return [{
      itemId: item.id,
      subskillId: item.subskillId,
      selectedAnswer,
      isCorrect: response.isCorrect,
      misconceptionTag: response.isCorrect ? null : item.distractorMap[selectedAnswer] ?? null,
    }];
  });
}

/**
 * Picks an unmet prerequisite before a dependent miss, then uses assignment
 * order as the stable tie-breaker. The model only explains this result.
 */
export function selectDiagnosticGap(evidence: readonly DiagnosticEvidence[], prerequisites: ReadonlyMap<string, string | null>): DiagnosticGap | null {
  const misses = evidence.filter((entry) => !entry.isCorrect);
  if (!misses.length) return null;

  const missedSkills = new Set(misses.map((entry) => entry.subskillId));
  const prerequisiteMiss = misses.find((entry) =>
    [...missedSkills].some((skillId) => isPrerequisiteOf(entry.subskillId, skillId, prerequisites)),
  );
  const selected = prerequisiteMiss ?? misses[0];
  return {
    subskillId: selected.subskillId,
    misconceptionTag: selected.misconceptionTag,
    evidence: misses.filter((entry) => entry.subskillId === selected.subskillId),
  };
}

function isPrerequisiteOf(candidate: string, skillId: string, prerequisites: ReadonlyMap<string, string | null>): boolean {
  let current = prerequisites.get(skillId) ?? null;
  while (current) {
    if (current === candidate) return true;
    current = prerequisites.get(current) ?? null;
  }
  return false;
}

export function selectPracticeItems(bank: readonly Item[], gapSubskillId: string, prerequisites: ReadonlyMap<string, string | null>, count = 4): Item[] {
  const primary = bank.filter((item) => item.subskillId === gapSubskillId);
  const dependents = bank.filter((item) => isPrerequisiteOf(gapSubskillId, item.subskillId, prerequisites));
  const selected = [...primary, ...dependents].slice(0, count);
  if (selected.length < count) {
    selected.push(...bank.filter((item) => !selected.some((chosen) => chosen.id === item.id)).slice(0, count - selected.length));
  }
  return selected;
}

export function nextMasteryLevel(previous: MasteryLevel, priorEvidenceCount: number, isCorrect: boolean, hasUnresolvedPrerequisite: boolean): { level: MasteryLevel; evidenceCount: number } {
  const evidenceCount = priorEvidenceCount + 1;
  if (!isCorrect) {
    // A single miss creates follow-up evidence but never flickers an already
    // mastered learner down during this narrow practice session.
    return { level: previous === "mastered" ? "mastered" : "needs_support", evidenceCount };
  }
  if (previous === "mastered") return { level: "mastered", evidenceCount };
  if (evidenceCount >= 2 && !hasUnresolvedPrerequisite) return { level: "mastered", evidenceCount };
  return { level: "developing", evidenceCount };
}

export function shouldRequeue(statusesForItem: readonly string[]): boolean {
  return !statusesForItem.includes("requeued") && statusesForItem.filter((status) => status === "missed").length === 0;
}
