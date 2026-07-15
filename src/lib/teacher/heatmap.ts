import type { HeatmapCell as SharedHeatmapCell } from "@/lib/demo/contracts";
import type { MasteryLevel } from "@/lib/types";

/**
 * The dashboard-facing shape shared by the teacher UI and its eventual
 * database query. Keep this independent of Supabase-generated types so the
 * UI can use the same contract with fixture data during parallel work.
 */
export type HeatmapCell = SharedHeatmapCell;

/** The narrow row shape expected from a teacher mastery query. */
export interface HeatmapQueryRow {
  student_id: string;
  subskill_id: string;
  level: string;
  evidence_summary: string | null;
}

export const heatmapMasteryLevels = [
  "not_started",
  "needs_support",
  "developing",
  "mastered",
] as const satisfies readonly MasteryLevel[];

export const defaultEvidenceSummary = "No recorded evidence yet.";

/**
 * This module owns only the UI contract and pure row normalization. Database
 * queries, grouping, and mutations remain owned by the data/domain layer.
 */
export function normalizeHeatmapCell(row: HeatmapQueryRow): HeatmapCell {
  return {
    studentId: requireNonEmptyString(row.student_id, "student_id"),
    subskillId: requireNonEmptyString(row.subskill_id, "subskill_id"),
    level: parseMasteryLevel(row.level),
    evidenceSummary: normalizeEvidenceSummary(row.evidence_summary),
  };
}

export function normalizeHeatmapRows(rows: readonly HeatmapQueryRow[]): HeatmapCell[] {
  return rows.map(normalizeHeatmapCell);
}

export function isHeatmapMasteryLevel(value: string): value is MasteryLevel {
  return (heatmapMasteryLevels as readonly string[]).includes(value);
}

function parseMasteryLevel(value: string): MasteryLevel {
  if (!isHeatmapMasteryLevel(value)) {
    throw new Error(`Unsupported mastery level for heatmap: ${value}`);
  }

  return value;
}

function requireNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Heatmap row requires a non-empty ${field}`);
  return normalized;
}

function normalizeEvidenceSummary(value: string | null): string {
  const normalized = value?.trim();
  return normalized || defaultEvidenceSummary;
}

/**
 * Local UI fixture only. It intentionally does not claim ownership of seed
 * records or Supabase IDs; replace it with normalized query data at runtime.
 */
export const exampleFractionsHeatmapCells = [
  {
    studentId: "example-maya",
    subskillId: "find-common-denominator",
    level: "needs_support",
    evidenceSummary: "Added denominators instead of finding a common denominator.",
  },
  {
    studentId: "example-diego",
    subskillId: "find-common-denominator",
    level: "needs_support",
    evidenceSummary: "Combined numerators and denominators directly.",
  },
  {
    studentId: "example-zara",
    subskillId: "find-common-denominator",
    level: "needs_support",
    evidenceSummary: "Needs support selecting an equivalent denominator.",
  },
  {
    studentId: "example-noah",
    subskillId: "find-common-denominator",
    level: "developing",
    evidenceSummary: "Found a common denominator with one reminder.",
  },
  {
    studentId: "example-ava",
    subskillId: "find-common-denominator",
    level: "not_started",
    evidenceSummary: defaultEvidenceSummary,
  },
  {
    studentId: "example-leo",
    subskillId: "find-common-denominator",
    level: "mastered",
    evidenceSummary: "Solved unlike-denominator addition independently twice.",
  },
] as const satisfies readonly HeatmapCell[];
