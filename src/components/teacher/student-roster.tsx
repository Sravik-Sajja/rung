"use client";

// Roster sidebar: lets a teacher pick "All students" or drill into one student.
// Each row surfaces a mini mastery strip and a needs-support count so the list itself
// carries signal, not just names.
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
  onSelect
}: {
  dashboard: TeacherDashboard;
  selectedStudentId: string | null;
  onSelect: (id: string | null) => void;
}) {
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
          const needsSupportCount = dashboard.cells.filter(
            (cell) => cell.studentId === student.id && cell.level === "needs_support"
          ).length;

          return (
            <li key={student.id}>
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
                  ) : (
                    <span className="text-ink-faint">On track</span>
                  )}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
