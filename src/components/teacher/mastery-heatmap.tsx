"use client";

// Skill-by-student heatmap: a real <table> (not div-grid) so screen readers get row/column
// headers for free. Cells always pair a mastery token color with a text label — never color alone.
// Data here is deterministic, stored mastery evidence; it is never model-generated.
import { cn } from "@/components/ui";
import Link from "next/link";
import { useState } from "react";
import type { MasteryLevel, TeacherDashboard } from "@/lib/types";

export const MASTERY_LEVEL_ORDER: MasteryLevel[] = ["not_started", "needs_support", "developing", "mastered"];

export const MASTERY_LEVEL_LABEL: Record<MasteryLevel, string> = {
  not_started: "Not started",
  needs_support: "Needs support",
  developing: "Developing",
  mastered: "Mastered"
};

const swatchClass: Record<MasteryLevel, string> = {
  not_started: "bg-mastery-none",
  needs_support: "bg-mastery-support",
  developing: "bg-mastery-developing",
  mastered: "bg-mastery-mastered"
};

const cellClass: Record<MasteryLevel, string> = {
  not_started: "bg-mastery-none text-mastery-none-fg",
  needs_support: "bg-mastery-support text-mastery-support-fg",
  developing: "bg-mastery-developing text-mastery-developing-fg",
  mastered: "bg-mastery-mastered text-mastery-mastered-fg"
};

export function MasteryLegend({ dashboard }: { dashboard: TeacherDashboard }) {
  const counts = MASTERY_LEVEL_ORDER.reduce(
    (acc, level) => {
      acc[level] = dashboard.cells.filter((cell) => cell.level === level).length;
      return acc;
    },
    {} as Record<MasteryLevel, number>
  );

  return (
    <ul aria-label="Mastery level legend with cell counts" className="flex flex-wrap gap-2">
      {MASTERY_LEVEL_ORDER.map((level) => (
        <li
          className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5"
          key={level}
        >
          <span aria-hidden className={cn("h-3 w-3 shrink-0", swatchClass[level])} />
          <span className="text-sm font-medium text-ink">{MASTERY_LEVEL_LABEL[level]}</span>
          <span className="font-mono text-xs tabular-nums text-ink-faint">{counts[level]}</span>
        </li>
      ))}
    </ul>
  );
}

export function MasteryHeatmapTable({
  dashboard,
  onSelectStudent,
  selectedStudentId,
  assignedFollowUpKeys = new Set<string>(),
  onAssignFollowUp,
  reminderKeys = new Set<string>(),
  onSendReminder,
  groupIdForCell,
}: {
  dashboard: TeacherDashboard;
  onSelectStudent?: (id: string) => void;
  selectedStudentId?: string | null;
  assignedFollowUpKeys?: ReadonlySet<string>;
  onAssignFollowUp?: (studentId: string, subskillId: string) => void;
  reminderKeys?: ReadonlySet<string>;
  onSendReminder?: (studentId: string, subskillId: string) => void;
  groupIdForCell?: (studentId: string, subskillId: string) => string | undefined;
}) {
  const [dismissedReminderKeys, setDismissedReminderKeys] = useState<Set<string>>(() => new Set());

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <caption className="sr-only">
          Mastery level by student and subskill, from stored diagnostic and practice evidence. Rows are
          students, columns are subskills. Each cell shows the mastery level as both a color and a text label.
        </caption>
        <thead>
          <tr>
            <th
              className="sticky left-0 z-10 border-b border-r border-border bg-surface-2 p-3 text-left font-mono text-xs font-medium uppercase tracking-wider text-ink-muted"
              scope="col"
            >
              Student
            </th>
            {dashboard.subskills.map((subskill) => (
              <th
                className="border-b border-r border-border bg-surface-2 p-3 text-center font-mono text-xs font-medium uppercase tracking-wider text-ink-muted"
                key={subskill.id}
                scope="col"
              >
                {subskill.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dashboard.students.map((student) => {
            const isSelected = selectedStudentId === student.id;
            return (
              <tr key={student.id}>
                <th
                  className={cn(
                    "sticky left-0 z-10 whitespace-nowrap border-b border-r border-border p-3 text-left text-sm font-medium text-ink",
                    isSelected ? "bg-accent-soft" : "bg-elevated"
                  )}
                  scope="row"
                >
                  {onSelectStudent ? (
                    <button
                      aria-pressed={isSelected}
                      className="w-full whitespace-nowrap text-left text-accent hover:underline"
                      onClick={() => onSelectStudent(student.id)}
                      type="button"
                    >
                      {student.displayName}
                    </button>
                  ) : (
                    student.displayName
                  )}
                </th>
                {dashboard.subskills.map((subskill) => {
                  const cell = dashboard.cells.find(
                    (candidate) => candidate.studentId === student.id && candidate.subskillId === subskill.id
                  );
                  if (!cell) {
                    return (
                      <td className="border-b border-r border-border p-2" key={`${student.id}-${subskill.id}`} />
                    );
                  }
                  const followUpKey = `${student.id}:${subskill.id}`;
                  const followUpAssigned = assignedFollowUpKeys.has(followUpKey);
                  const reminderSent = reminderKeys.has(followUpKey);
                  const groupId = groupIdForCell?.(student.id, subskill.id);
                  const hasQuickAction = cell.level !== "mastered"
                    && !(cell.level === "not_started" && dismissedReminderKeys.has(followUpKey));
                  return (
                    <td
                      className={cn(
                        "border-b border-r border-border p-0 align-middle",
                        cellClass[cell.level]
                      )}
                      key={`${student.id}-${subskill.id}`}
                    >
                      <div
                        className="group relative flex min-h-[3rem] h-full items-center justify-center"
                        onMouseLeave={() => {
                          if (dismissedReminderKeys.has(followUpKey)) {
                            setDismissedReminderKeys((current) => {
                              const next = new Set(current);
                              next.delete(followUpKey);
                              return next;
                            });
                          }
                        }}
                      >
                        <span
                          className={cn(
                            "flex w-full items-center justify-center px-2 py-1.5 text-center text-xs font-medium leading-tight",
                            hasQuickAction && "transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                          )}
                          title={cell.evidenceSummary}
                        >
                          {MASTERY_LEVEL_LABEL[cell.level]}
                        </span>
                        {hasQuickAction ? (
                          <div className="pointer-events-none absolute inset-1 flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                            {cell.level === "not_started" && onSendReminder ? (
                              reminderSent ? (
                                <span className="rounded border border-ink/20 bg-surface-2 px-2 py-1 text-[11px] font-semibold text-ink-muted">
                                  Reminded
                                </span>
                              ) : (
                                <button
                                  className="rounded border border-ink/30 bg-surface px-2 py-1 text-[11px] font-semibold text-ink shadow-sm hover:bg-surface-2"
                                  onClick={() => {
                                    onSendReminder(student.id, subskill.id);
                                    setDismissedReminderKeys((current) => new Set(current).add(followUpKey));
                                  }}
                                  title="Send a reminder to begin this skill"
                                  type="button"
                                >
                                  Remind
                                </button>
                              )
                            ) : null}
                            {(cell.level === "needs_support" || cell.level === "developing") && onAssignFollowUp ? (
                              <button
                                className="rounded border border-ink/30 bg-surface px-1.5 py-1 text-[11px] font-semibold text-ink shadow-sm hover:bg-surface-2"
                                onClick={() => onAssignFollowUp(student.id, subskill.id)}
                                title="Assign a 3-question follow-up"
                                type="button"
                              >
                                {followUpAssigned ? "Assigned" : "Assign 3Q"}
                              </button>
                            ) : null}
                            {cell.level === "needs_support" && groupId ? (
                              <Link
                                className="rounded border border-ink/30 bg-surface px-1.5 py-1 text-[11px] font-semibold text-ink shadow-sm hover:bg-surface-2"
                                href={`/teacher/groups/${groupId}`}
                                title="Open the shared group lesson"
                              >
                                Lesson
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
