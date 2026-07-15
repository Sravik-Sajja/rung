import type { MasteryLevel } from "../types";

export const canonicalDemoIds = {
  classId: "fractions-demo-class",
  teacherName: "Ms. Rivera",
  mayaStudentId: "maya-chen",
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

export interface HeatmapCell {
  studentId: string;
  subskillId: string;
  level: MasteryLevel;
  evidenceSummary: string;
}

export function isMasteryLevel(value: string): value is MasteryLevel {
  return (masteryLevels as readonly string[]).includes(value);
}
