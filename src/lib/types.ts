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

/**
 * A learner-facing visual is descriptive item data, never a substitute for
 * the server-only answer specification. Keeping this narrow makes visuals
 * safe to persist and render in both the local and durable practice paths.
 */
export type ItemVisualSpec = {
  kind: "number_line";
  denominator: number;
  markedNumerator: number;
  pointLabel: string;
};

export interface DemoStudent { id: string; displayName: string; gradeBand: string; }
export interface Item { id: string; subskillId: string; prompt: string; answerSpec: AnswerSpec; distractorMap: Record<string, string>; visualSpec?: ItemVisualSpec; }
export interface Diagnosis { subskillId: string; misconceptionTag: string; observation: string; nextStep: string; }

export interface Subskill { id: string; name: string; }
export interface MasteryRecord { studentId: string; subskillId: string; level: MasteryLevel; evidenceSummary: string; }
export interface HeatmapCell extends MasteryRecord {}
export interface TeacherGroup { id: string; subskillId: string; label: string; studentIds: string[]; }
export interface TeacherDashboard { classId: string; students: DemoStudent[]; subskills: Subskill[]; cells: HeatmapCell[]; groups: TeacherGroup[]; responseEvidenceByStudent?: Record<string, TeacherStudentEvidence["attemptsBySubskill"]>; /** Every existing teacher-origin practice plan among this dashboard's own students, so a reload reflects what was already assigned instead of resetting to nothing. Undefined for the fixed sample class, whose fictional roster has no real assignment persistence. */ assignedFollowUps?: Array<{ studentId: string; subskillId: string }>; }
export interface LessonStep { minutes: number; activity: string; }
export interface VettedVideo { title: string; provider: string; url: string; verificationNote: string; embedUrl?: string; }
export interface TeacherGroupPlan { groupId: string; objective: string; durationMinutes: number; materials: string[]; steps: LessonStep[]; checkForUnderstanding: string; practiceItemIds: string[]; video: VettedVideo; }

/**
 * The narrow response record a teacher may review: the learner's submitted answer,
 * the question they saw, and what scoring accepts for it. It still never carries the
 * distractor map, diagnosis text, hint/work-help content, or peer material.
 *
 * `correctAnswer` IS an answer key, so this record is no longer safe to hand to a
 * learner surface. Today the only consumer is the teacher dashboard — but that route
 * is unauthenticated and AppShell links to it from the student nav, so a learner in
 * DEMO_MODE can reach it in one click. Gate /teacher behind real auth before any live
 * classroom use; see migration 004, which keeps answer_spec away from learners at the
 * database layer for exactly this reason.
 */
export interface TeacherAttemptEvidence {
  id: string;
  itemId: string;
  prompt: string;
  visualSpec?: ItemVisualSpec;
  answerRaw: string;
  correctAnswer: string;
  isCorrect: boolean;
  context: "diagnostic" | "practice";
  submittedAt: string;
}

export interface TeacherStudentEvidence {
  studentId: string;
  attemptsBySubskill: Record<string, TeacherAttemptEvidence[]>;
}
