"use client";

import { useState } from "react";
import { GroupCard } from "@/components/teacher/group-card";
import { MasteryHeatmapTable, MasteryLegend } from "@/components/teacher/mastery-heatmap";
import { StudentDetail } from "@/components/teacher/student-detail";
import { StudentRoster } from "@/components/teacher/student-roster";
import { Card } from "@/components/ui";
import type { TeacherDashboard } from "@/lib/types";

export function DashboardView({ dashboard }: { dashboard: TeacherDashboard }) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const totalCells = dashboard.cells.length;
  const masteredCount = dashboard.cells.filter((cell) => cell.level === "mastered").length;
  const needsSupportCount = dashboard.cells.filter((cell) => cell.level === "needs_support").length;
  const masteredPct = totalCells > 0 ? Math.round((masteredCount / totalCells) * 100) : 0;

  const summaryStats: Array<{ label: string; value: string }> = [
    { label: "Students", value: String(dashboard.students.length) },
    { label: "Subskills tracked", value: String(dashboard.subskills.length) },
    { label: "Cells mastered", value: `${masteredPct}%` },
    { label: "Needs support", value: String(needsSupportCount) },
    { label: "Suggested groups", value: String(dashboard.groups.length) }
  ];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="w-full shrink-0 lg:sticky lg:top-24 lg:w-[280px]">
        <StudentRoster dashboard={dashboard} onSelect={setSelectedStudentId} selectedStudentId={selectedStudentId} />
      </aside>

      <div className="min-w-0 flex-1">
        {selectedStudentId !== null ? (
          <div>
            <button
              className="font-mono text-xs uppercase tracking-wider text-accent"
              onClick={() => setSelectedStudentId(null)}
              type="button"
            >
              ← Back to class view
            </button>
            <div className="mt-4">
              <StudentDetail dashboard={dashboard} studentId={selectedStudentId} />
            </div>
          </div>
        ) : (
          <>
            <section aria-label="Class summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {summaryStats.map((stat) => (
                <Card className="!bg-elevated p-4" key={stat.label}>
                  <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
                    {stat.label}
                  </p>
                  <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{stat.value}</p>
                </Card>
              ))}
            </section>

            <section aria-labelledby="heatmap-heading" className="mt-10 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-ink" id="heatmap-heading">
                  Skill-by-student heatmap
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  One row per student, one column per subskill. Each cell pairs a mastery color with a text label,
                  and hovering a cell shows the stored evidence behind it. Select a student row to open their
                  detail.
                </p>
              </div>

              <Card className="!bg-elevated overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">Legend</p>
                  <MasteryLegend dashboard={dashboard} />
                </div>
                <MasteryHeatmapTable
                  dashboard={dashboard}
                  onSelectStudent={setSelectedStudentId}
                  selectedStudentId={selectedStudentId}
                />
              </Card>
            </section>

            <section aria-labelledby="groups-heading" className="mt-10">
              <h2 className="text-lg font-semibold text-ink" id="groups-heading">
                Suggested small groups
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Students are grouped when two or more share a stored needs-support status on the same subskill.
              </p>

              {dashboard.groups.length === 0 ? (
                <Card className="!bg-elevated mt-3 p-5">
                  <p className="text-sm text-ink-muted">
                    No subskill currently has two or more students marked needs-support, so no groups are
                    suggested.
                  </p>
                </Card>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {dashboard.groups.map((group) => (
                    <GroupCard
                      group={group}
                      key={group.id}
                      subskill={dashboard.subskills.find((subskill) => subskill.id === group.subskillId)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
