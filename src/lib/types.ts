// Shared domain types used by UI, deterministic logic, and server contracts.
export type MasteryLevel = "not_started" | "needs_support" | "developing" | "mastered";
export type HintLevel = "nudge" | "hint" | "guided_step";

/**
 * Most items have a finite, exact answer list. Some questions constrain the answer in a way a
 * literal list cannot express, because scoring compares fractions by VALUE. Keep those rules in the
 * answer specification instead of inferring them from prompt wording, while leaving existing
 * `accepted`-only seed rows fully supported.
 *
 * - `positive_common_multiple`: a common-denominator question — any positive common multiple is
 *   mathematically valid, not just the least.
 * - `exact_denominator`: an equivalent-fraction question that names its target denominator
 *   ("...with denominator 6"). The answer must both have the right value AND be written over that
 *   denominator. Without this, value-only scoring accepts the question restated back ("1/3" for
 *   "write 1/3 with denominator 6"), so the learner could pass without doing anything.
 */
export type AnswerRule =
  | {
      kind: "positive_common_multiple";
      denominators: readonly [number, number];
    }
  | {
      kind: "exact_denominator";
      denominator: number;
    };

export interface AnswerSpec {
  accepted: string[];
  rule?: AnswerRule;
}

export interface DemoStudent { id: string; displayName: string; gradeBand: string; }
export interface Item { id: string; subskillId: string; prompt: string; answerSpec: AnswerSpec; distractorMap: Record<string, string>; }
export interface Diagnosis { subskillId: string; misconceptionTag: string; observation: string; nextStep: string; }

export interface Subskill { id: string; name: string; }
export interface MasteryRecord { studentId: string; subskillId: string; level: MasteryLevel; evidenceSummary: string; }
export interface HeatmapCell extends MasteryRecord {}
export interface TeacherGroup { id: string; subskillId: string; label: string; studentIds: string[]; }
export interface TeacherDashboard { classId: string; students: DemoStudent[]; subskills: Subskill[]; cells: HeatmapCell[]; groups: TeacherGroup[]; }
export interface LessonStep { minutes: number; activity: string; }
export interface VettedVideo { title: string; provider: string; url: string; verificationNote: string; }
export interface TeacherGroupPlan { groupId: string; objective: string; durationMinutes: number; materials: string[]; steps: LessonStep[]; checkForUnderstanding: string; practiceItemIds: string[]; video: VettedVideo; }
