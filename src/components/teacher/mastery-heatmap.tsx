// Skill-by-student heatmap: a real <table> (not div-grid) so screen readers get row/column
// headers for free. Cells always pair a mastery token color with a text label — never color alone.
// Data here is deterministic, stored mastery evidence; it is never model-generated.
import { cn } from "@/components/ui";
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

export function MasteryHeatmapTable({ dashboard }: { dashboard: TeacherDashboard }) {
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
          {dashboard.students.map((student) => (
            <tr key={student.id}>
              <th
                className="sticky left-0 z-10 border-b border-r border-border bg-elevated p-3 text-left text-sm font-medium text-ink"
                scope="row"
              >
                {student.displayName}
              </th>
              {dashboard.subskills.map((subskill) => {
                const cell = dashboard.cells.find(
                  (candidate) => candidate.studentId === student.id && candidate.subskillId === subskill.id
                );
                if (!cell) {
                  return <td className="border-b border-r border-border p-2" key={`${student.id}-${subskill.id}`} />;
                }
                return (
                  <td className="border-b border-r border-border p-0" key={`${student.id}-${subskill.id}`}>
                    <span
                      className={cn(
                        "flex min-h-[3rem] w-full items-center justify-center px-2 py-1.5 text-center text-xs font-medium leading-tight",
                        cellClass[cell.level]
                      )}
                      title={cell.evidenceSummary}
                    >
                      {MASTERY_LEVEL_LABEL[cell.level]}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
