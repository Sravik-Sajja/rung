"use client";

import { useState } from "react";
import { GroupCard } from "@/components/teacher/group-card";
import { MasteryHeatmapTable, MasteryLegend } from "@/components/teacher/mastery-heatmap";
import { StudentDetail } from "@/components/teacher/student-detail";
import { StudentRoster } from "@/components/teacher/student-roster";
import { Card } from "@/components/ui";
import type { TeacherDashboard } from "@/lib/types";

export function DashboardView({
  dashboard,
  onRemoveStudent,
  removingStudentId,
}: {
  dashboard: TeacherDashboard;
  /** Only a temporary workspace passes these; the sample class roster is fixed. */
  onRemoveStudent?: (id: string) => void;
  removingStudentId?: string | null;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [assignedFollowUps, setAssignedFollowUps] = useState<Set<string>>(() => new Set());
  const [sentReminders, setSentReminders] = useState<Set<string>>(() => new Set());
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  function followUpKey(studentId: string, subskillId: string) {
    return `${studentId}:${subskillId}`;
  }

  function assignFollowUp(studentId: string, subskillId: string) {
    const student = dashboard.students.find((candidate) => candidate.id === studentId);
    const subskill = dashboard.subskills.find((candidate) => candidate.id === subskillId);
    setAssignedFollowUps((current) => new Set(current).add(followUpKey(studentId, subskillId)));
    setActionNotice(`Assigned a 3-question follow-up to ${student?.displayName ?? "student"} for ${subskill?.name ?? "this skill"}.`);
  }

  function sendReminder(studentId: string, subskillId: string) {
    const student = dashboard.students.find((candidate) => candidate.id === studentId);
    const subskill = dashboard.subskills.find((candidate) => candidate.id === subskillId);
    setSentReminders((current) => new Set(current).add(followUpKey(studentId, subskillId)));
    setActionNotice(`Sent ${student?.displayName ?? "the student"} a reminder to begin ${subskill?.name ?? "this skill"}.`);
  }

  function groupForCell(studentId: string, subskillId: string) {
    return dashboard.groups.find((group) => group.subskillId === subskillId && group.studentIds.includes(studentId))?.id;
  }

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
        <StudentRoster
          dashboard={dashboard}
          onRemoveStudent={onRemoveStudent}
          onSelect={setSelectedStudentId}
          removingStudentId={removingStudentId}
          selectedStudentId={selectedStudentId}
        />
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
                  and hovering eligible cells shows quick actions. Select a student row to open their
                  detail.
                </p>
              </div>

              <Card className="!bg-elevated overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">Legend</p>
                  <MasteryLegend dashboard={dashboard} />
                </div>
                <MasteryHeatmapTable
                  assignedFollowUpKeys={assignedFollowUps}
                  dashboard={dashboard}
                  groupIdForCell={groupForCell}
                  onAssignFollowUp={assignFollowUp}
                  onSendReminder={sendReminder}
                  onSelectStudent={setSelectedStudentId}
                  reminderKeys={sentReminders}
                  selectedStudentId={selectedStudentId}
                />
              </Card>
              {actionNotice ? (
                <p aria-live="polite" className="rounded-md border border-focus bg-focus-soft px-3 py-2 text-sm text-ink">
                  {actionNotice}
                </p>
              ) : null}
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
                      followUpAssigned={group.studentIds.every((studentId) => assignedFollowUps.has(followUpKey(studentId, group.subskillId)))}
                      group={group}
                      key={group.id}
                      onAssignFollowUp={() => {
                        group.studentIds.forEach((studentId) => assignFollowUp(studentId, group.subskillId));
                        setActionNotice(`Assigned a 3-question follow-up to ${group.studentIds.length} students in ${group.label}.`);
                      }}
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
