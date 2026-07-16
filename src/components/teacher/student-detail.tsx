"use client";

// Per-student detail pane: mastery summary, subskill-by-subskill evidence, and any
// suggested small groups this student belongs to.
import { Badge, Card } from "@/components/ui";
import { GroupCard } from "@/components/teacher/group-card";
import { MASTERY_LEVEL_LABEL, MASTERY_LEVEL_ORDER } from "@/components/teacher/mastery-heatmap";
import type { MasteryLevel, TeacherDashboard } from "@/lib/types";

const MASTERY_TONE: Record<MasteryLevel, "none" | "support" | "developing" | "mastered"> = {
  not_started: "none",
  needs_support: "support",
  developing: "developing",
  mastered: "mastered"
};

export function StudentDetail({
  dashboard,
  studentId
}: {
  dashboard: TeacherDashboard;
  studentId: string;
}) {
  const student = dashboard.students.find((candidate) => candidate.id === studentId);

  if (!student) {
    return (
      <Card className="!bg-elevated p-5">
        <p className="text-sm text-ink-muted">Student not found.</p>
      </Card>
    );
  }

  const summaryCounts = MASTERY_LEVEL_ORDER.reduce(
    (acc, level) => {
      acc[level] = dashboard.cells.filter(
        (cell) => cell.studentId === studentId && cell.level === level
      ).length;
      return acc;
    },
    {} as Record<MasteryLevel, number>
  );

  const groups = dashboard.groups.filter((group) => group.studentIds.includes(studentId));

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-semibold text-ink">{student.displayName}</h2>
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-faint">
            {student.gradeBand}
          </p>
        </div>

        <div aria-label="Mastery summary" className="flex flex-wrap gap-2">
          {MASTERY_LEVEL_ORDER.map((level) => (
            <Badge key={level} tone={MASTERY_TONE[level]}>
              {MASTERY_LEVEL_LABEL[level]} &middot; {summaryCounts[level]}
            </Badge>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {dashboard.subskills.map((subskill) => {
            const cell = dashboard.cells.find(
              (candidate) => candidate.studentId === studentId && candidate.subskillId === subskill.id
            );

            return (
              <Card className="!bg-elevated p-4" key={subskill.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{subskill.name}</p>
                  {cell ? (
                    <Badge tone={MASTERY_TONE[cell.level]}>{MASTERY_LEVEL_LABEL[cell.level]}</Badge>
                  ) : (
                    <Badge tone="none">No data</Badge>
                  )}
                </div>
                {cell ? <p className="mt-2 text-sm text-ink-muted">{cell.evidenceSummary}</p> : null}
              </Card>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">Suggested groups</h3>
          <p className="text-sm text-ink-muted">Small groups formed around this student&apos;s shared gaps.</p>
        </div>
        {groups.length === 0 ? (
          <Card className="!bg-elevated p-5">
            <p className="text-sm text-ink-muted">
              This student isn&apos;t in any suggested small group right now.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <GroupCard
                group={group}
                key={group.id}
                subskill={dashboard.subskills.find((subskill) => subskill.id === group.subskillId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
