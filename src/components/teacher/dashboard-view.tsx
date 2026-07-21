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
  groupHrefFor,
  onRemoveStudent,
  removingStudentId,
  onPersistFollowUp,
}: {
  dashboard: TeacherDashboard;
  /** Workspace dashboards use their own lesson route instead of sample-class routes. */
  groupHrefFor?: (groupId: string) => string;
  /** Only a temporary workspace passes these; the sample class roster is fixed. */
  onRemoveStudent?: (id: string) => void;
  removingStudentId?: string | null;
  /**
   * Only the workspace passes this. When present, `assignFollowUp` persists the
   * follow-up through the assign-practice endpoint instead of only flipping the
   * local notice; the fixed sample class leaves this undefined and keeps the
   * pre-existing client-only simulation below.
   */
  onPersistFollowUp?: (studentId: string, subskillId: string) => Promise<{ alreadyAssigned: boolean }>;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [assignedFollowUps, setAssignedFollowUps] = useState<Set<string>>(
    () => new Set((dashboard.assignedFollowUps ?? []).map((entry) => followUpKey(entry.studentId, entry.subskillId)))
  );
  const [sentReminders, setSentReminders] = useState<Set<string>>(() => new Set());
  const [actionNotice, setActionNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  function followUpKey(studentId: string, subskillId: string) {
    return `${studentId}:${subskillId}`;
  }

  /**
   * Optimistically marks a cell assigned, then (workspace only) persists it
   * through `onPersistFollowUp`, rolling the optimistic mark back on failure.
   * Returns a result instead of setting the notice itself so the group-level
   * bulk path below can assign several students and report one combined notice.
   */
  async function persistFollowUp(studentId: string, subskillId: string): Promise<{ ok: true; alreadyAssigned: boolean } | { ok: false; error: string }> {
    const key = followUpKey(studentId, subskillId);
    setAssignedFollowUps((current) => new Set(current).add(key));

    if (!onPersistFollowUp) {
      // Fixed sample class: the roster is fictional, so there is nothing to persist —
      // this stays a local-only simulation of what assigning would look like.
      return { ok: true, alreadyAssigned: false };
    }

    try {
      const result = await onPersistFollowUp(studentId, subskillId);
      return { ok: true, alreadyAssigned: result.alreadyAssigned };
    } catch (reason) {
      setAssignedFollowUps((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      return { ok: false, error: reason instanceof Error ? reason.message : "Could not assign that follow-up." };
    }
  }

  async function assignFollowUp(studentId: string, subskillId: string) {
    const student = dashboard.students.find((candidate) => candidate.id === studentId);
    const subskill = dashboard.subskills.find((candidate) => candidate.id === subskillId);
    const outcome = await persistFollowUp(studentId, subskillId);

    if (!outcome.ok) {
      setActionNotice({ tone: "error", message: outcome.error });
      return;
    }
    if (outcome.alreadyAssigned) {
      const firstName = student?.displayName.split(" ")[0] ?? "the student";
      setActionNotice({ tone: "success", message: `Already assigned — waiting for ${firstName} to finish it.` });
      return;
    }
    setActionNotice({ tone: "success", message: `Assigned a 3-question follow-up to ${student?.displayName ?? "student"} for ${subskill?.name ?? "this skill"}.` });
  }

  function sendReminder(studentId: string, subskillId: string) {
    const student = dashboard.students.find((candidate) => candidate.id === studentId);
    const subskill = dashboard.subskills.find((candidate) => candidate.id === subskillId);
    setSentReminders((current) => new Set(current).add(followUpKey(studentId, subskillId)));
    setActionNotice({ tone: "success", message: `Sent ${student?.displayName ?? "the student"} a reminder to begin ${subskill?.name ?? "this skill"}.` });
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
                  groupHrefFor={groupHrefFor}
                  onAssignFollowUp={assignFollowUp}
                  onSendReminder={sendReminder}
                  onSelectStudent={setSelectedStudentId}
                  reminderKeys={sentReminders}
                  selectedStudentId={selectedStudentId}
                />
              </Card>
              {actionNotice ? (
                <p
                  aria-live="polite"
                  className={
                    actionNotice.tone === "error"
                      ? "rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
                      : "rounded-md border border-focus bg-focus-soft px-3 py-2 text-sm text-ink"
                  }
                  role={actionNotice.tone === "error" ? "alert" : undefined}
                >
                  {actionNotice.message}
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
                      lessonHref={groupHrefFor?.(group.id)}
                      onAssignFollowUp={async () => {
                        const outcomes = await Promise.all(
                          group.studentIds.map((studentId) => persistFollowUp(studentId, group.subskillId))
                        );
                        const firstFailure = outcomes.find((outcome) => !outcome.ok);
                        if (firstFailure && !firstFailure.ok) {
                          const failedCount = outcomes.filter((outcome) => !outcome.ok).length;
                          setActionNotice({
                            tone: "error",
                            message: `${firstFailure.error} (${failedCount} of ${group.studentIds.length} in ${group.label} could not be assigned.)`
                          });
                          return;
                        }
                        setActionNotice({
                          tone: "success",
                          message: `Assigned a 3-question follow-up to ${group.studentIds.length} students in ${group.label}.`
                        });
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
