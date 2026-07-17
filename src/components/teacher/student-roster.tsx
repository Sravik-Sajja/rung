"use client";

// Roster sidebar: lets a teacher pick "All students" or drill into one student.
// Each row surfaces a mini mastery strip and a needs-support count so the list itself
// carries signal, not just names.
import { useState } from "react";
import { cn } from "@/components/ui";
import { MASTERY_LEVEL_LABEL } from "@/components/teacher/mastery-heatmap";
import type { MasteryLevel, TeacherDashboard } from "@/lib/types";

const MASTERY_SWATCH: Record<MasteryLevel, string> = {
  not_started: "bg-mastery-none",
  needs_support: "bg-mastery-support",
  developing: "bg-mastery-developing",
  mastered: "bg-mastery-mastered"
};

export function StudentRoster({
  dashboard,
  selectedStudentId,
  onSelect,
  onRemoveStudent,
  removingStudentId,
}: {
  dashboard: TeacherDashboard;
  selectedStudentId: string | null;
  onSelect: (id: string | null) => void;
  /** Only a temporary workspace passes this. The sample class roster is fixed. */
  onRemoveStudent?: (id: string) => void;
  removingStudentId?: string | null;
}) {
  // Removing purges that learner's work for this class, so it takes two clicks
  // rather than a single stray one next to the row you meant to open.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  return (
    <nav aria-label="Student roster">
      <ul className="flex flex-col gap-2">
        <li>
          <button
            aria-current={selectedStudentId === null ? "true" : undefined}
            className={cn(
              "w-full rounded-lg border p-3 text-left transition",
              selectedStudentId === null
                ? "border-accent bg-accent-soft"
                : "border-border bg-elevated hover:border-border-strong"
            )}
            onClick={() => onSelect(null)}
            type="button"
          >
            <p className="text-sm font-medium text-ink">All students</p>
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
              Class overview
            </p>
          </button>
        </li>
        {dashboard.students.map((student) => {
          const isActive = selectedStudentId === student.id;
          const studentCells = dashboard.cells.filter((cell) => cell.studentId === student.id);
          const needsSupportCount = studentCells.filter((cell) => cell.level === "needs_support").length;
          // A learner with no evidence at all has nothing to be on track with.
          // Counting only needs-support made an untouched roster read "On track".
          const hasStarted = studentCells.some((cell) => cell.level !== "not_started");

          const isConfirming = confirmingId === student.id;
          const isRemoving = removingStudentId === student.id;

          return (
            // The remove control is a sibling, not a child: a button cannot
            // legally nest inside the row button that opens the student.
            <li className="relative" key={student.id} onMouseLeave={() => setConfirmingId((current) => (current === student.id ? null : current))}>
              <button
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition",
                  isActive ? "border-accent bg-accent-soft" : "border-border bg-elevated hover:border-border-strong"
                )}
                onClick={() => onSelect(student.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{student.displayName}</p>
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">{student.gradeBand}</p>
                </div>
                <div className="mt-2 flex gap-1">
                  {dashboard.subskills.map((subskill) => {
                    const cell = dashboard.cells.find(
                      (candidate) => candidate.studentId === student.id && candidate.subskillId === subskill.id
                    );
                    return (
                      <span className="inline-flex" key={subskill.id}>
                        <span
                          aria-hidden
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-[3px]",
                            cell ? MASTERY_SWATCH[cell.level] : "bg-surface-2"
                          )}
                        />
                        <span className="sr-only">
                          {subskill.name}: {cell ? MASTERY_LEVEL_LABEL[cell.level] : "No data"}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <p className="mt-2 font-mono text-xs tabular-nums text-ink-muted">
                  {needsSupportCount > 0 ? (
                    `${needsSupportCount} need support`
                  ) : hasStarted ? (
                    <span className="text-ink-faint">On track</span>
                  ) : (
                    <span className="text-ink-faint">Not started</span>
                  )}
                </p>
              </button>
              {onRemoveStudent ? (
                <button
                  aria-label={isConfirming
                    ? `Confirm removing ${student.displayName} from this class`
                    : `Remove ${student.displayName} from this class`}
                  className={cn(
                    "absolute bottom-2.5 right-2 rounded px-1.5 py-0.5 font-mono text-xs transition",
                    isConfirming
                      ? "bg-danger-soft text-danger"
                      : "text-ink-faint hover:bg-danger-soft hover:text-danger"
                  )}
                  disabled={isRemoving}
                  onClick={() => {
                    if (!isConfirming) {
                      setConfirmingId(student.id);
                      return;
                    }
                    setConfirmingId(null);
                    onRemoveStudent(student.id);
                  }}
                  title={isConfirming
                    ? `Removing ${student.displayName} also deletes their work in this class`
                    : `Remove ${student.displayName}`}
                  type="button"
                >
                  {isRemoving ? "Removing…" : isConfirming ? "Remove?" : "Remove"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
