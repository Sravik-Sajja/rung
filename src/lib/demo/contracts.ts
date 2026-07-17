import type { MasteryLevel } from "../types";

/**
 * Immutable identifiers and small data fixtures shared by the seed and future
 * database-backed projections. Keep UI-specific demo data out of this file.
 */
export const canonicalDemoIds = {
  classId: "fractions-demo-class",
  teacherName: "Ms. Rivera",
  // Legacy property name retained temporarily for fixture compatibility; this
  // is now only an ordinary fictional teacher-roster record, never a route fallback.
  mayaStudentId: "riley-johnson",
  fractionsTopicId: "fractions-rational-operations",
  commonDenominatorSubskillId: "find-common-denominator",
  diagnosticAssignmentId: "fractions-diagnostic-v1",
} as const;

export const masteryLevels = [
  "not_started",
  "needs_support",
  "developing",
  "mastered",
] as const satisfies readonly MasteryLevel[];

export const canonicalDemoStudents = [
  { id: canonicalDemoIds.mayaStudentId, displayName: "Riley Johnson", isDemoDefault: false },
  { id: "diego-alvarez", displayName: "Diego Alvarez" },
  { id: "zara-williams", displayName: "Zara Williams" },
  { id: "noah-brooks", displayName: "Noah Brooks" },
  { id: "ava-patel", displayName: "Ava Patel" },
  { id: "leo-martin", displayName: "Leo Martin" },
  { id: "sofia-nguyen", displayName: "Sofia Nguyen" },
  { id: "ethan-williams", displayName: "Ethan Williams" },
] as const;

export const canonicalDemoSubskillIds = [
  "equivalent-fractions",
  "fraction-number-line",
  canonicalDemoIds.commonDenominatorSubskillId,
  "add-unlike-denominators",
  "subtract-unlike-denominators",
] as const;

/** IDs referenced by the teacher group-plan projection must be present in seed data. */
export const canonicalTeacherPracticeItemIds = [
  "equivalent-1",
  "number-line-1",
  "common-denominator-1",
  "add-unlike-1",
  "subtract-unlike-1",
] as const;

/** Fixed order for the five-question fractions diagnostic. */
export const canonicalDiagnosticItemIds = [
  "equivalent-1",
  "number-line-1",
  "common-denominator-1",
  "add-unlike-1",
  "subtract-unlike-1",
] as const;

export const canonicalTeacherGroupIds = [
  "equivalent-fractions",
  "fraction-number-line",
  canonicalDemoIds.commonDenominatorSubskillId,
  "add-unlike-denominators",
  "subtract-unlike-denominators",
] as const;

export interface HeatmapCell {
  studentId: string;
  subskillId: string;
  level: MasteryLevel;
  evidenceSummary: string;
}

export function isMasteryLevel(value: string): value is MasteryLevel {
  return (masteryLevels as readonly string[]).includes(value);
}
