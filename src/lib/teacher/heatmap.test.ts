import { describe, expect, it } from "vitest";
import {
  defaultEvidenceSummary,
  exampleFractionsHeatmapCells,
  normalizeHeatmapCell,
  normalizeHeatmapRows,
} from "@/lib/teacher/heatmap";

describe("teacher heatmap contract", () => {
  it("normalizes a database-shaped mastery row into the stable UI contract", () => {
    expect(normalizeHeatmapCell({
      student_id: " maya-chen ",
      subskill_id: " find-common-denominator ",
      level: "needs_support",
      evidence_summary: "  Added denominators directly.  ",
    })).toEqual({
      studentId: "maya-chen",
      subskillId: "find-common-denominator",
      level: "needs_support",
      evidenceSummary: "Added denominators directly.",
    });
  });

  it("provides a display-safe evidence summary when no evidence exists yet", () => {
    expect(normalizeHeatmapRows([{
      student_id: "ava-patel",
      subskill_id: "find-common-denominator",
      level: "not_started",
      evidence_summary: null,
    }])[0]?.evidenceSummary).toBe(defaultEvidenceSummary);
  });

  it("rejects rows with a mastery level outside the shared enum", () => {
    expect(() => normalizeHeatmapCell({
      student_id: "maya-chen",
      subskill_id: "find-common-denominator",
      level: "almost_mastered",
      evidence_summary: "A note",
    })).toThrow("Unsupported mastery level for heatmap");
  });

  it("provides a local fixture with a ready-to-group common-denominator cohort", () => {
    expect(exampleFractionsHeatmapCells.filter((cell) => cell.level === "needs_support"))
      .toHaveLength(3);
  });
});
