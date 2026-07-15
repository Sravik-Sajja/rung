// Shared domain types used by UI, deterministic logic, and server contracts.
export type MasteryLevel = "not_started" | "needs_support" | "developing" | "mastered";
export type HintLevel = "nudge" | "hint" | "guided_step";

export interface DemoStudent { id: string; displayName: string; gradeBand: string; }
export interface Item { id: string; subskillId: string; prompt: string; answerSpec: { accepted: string[] }; distractorMap: Record<string, string>; }
export interface Diagnosis { subskillId: string; misconceptionTag: string; observation: string; nextStep: string; }

export interface Subskill { id: string; name: string; }
export interface MasteryRecord { studentId: string; subskillId: string; level: MasteryLevel; evidenceSummary: string; }
export interface HeatmapCell extends MasteryRecord {}
export interface TeacherGroup { id: string; subskillId: string; label: string; studentIds: string[]; }
export interface TeacherDashboard { classId: string; students: DemoStudent[]; subskills: Subskill[]; cells: HeatmapCell[]; groups: TeacherGroup[]; }
export interface LessonStep { minutes: number; activity: string; }
export interface VettedVideo { title: string; provider: string; url: string; verificationNote: string; }
export interface TeacherGroupPlan { groupId: string; objective: string; durationMinutes: number; materials: string[]; steps: LessonStep[]; checkForUnderstanding: string; practiceItemIds: string[]; video: VettedVideo; }
