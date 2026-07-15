// Teacher dashboard route; renders deterministic mastery evidence and groups, never model-generated results.
import { AppShell } from "@/components/app-shell";
import { GroupCard } from "@/components/teacher/group-card";
import { MasteryHeatmapTable, MasteryLegend } from "@/components/teacher/mastery-heatmap";
import { Card, PageHeader } from "@/components/ui";
import { getDemoTeacherDashboard } from "@/lib/teacher/grouping";

export default function DashboardPage() {
  const dashboard = getDemoTeacherDashboard();

  if (!dashboard) {
    return (
      <AppShell active="teacher">
        <PageHeader
          description="No class data is available for this demo class."
          eyebrow="Teacher"
          title="Class dashboard"
        />
      </AppShell>
    );
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
    <AppShell active="teacher">
      <PageHeader
        description={`Mastery evidence from ${dashboard.students.length} students across ${dashboard.subskills.length} fraction subskills. Cells reflect stored diagnostic and practice evidence — never model-generated. This prototype is not for grading.`}
        eyebrow="Teacher · fractions class"
        title="Ms. Rivera's fractions class"
      />

      <section aria-label="Class summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summaryStats.map((stat) => (
          <Card className="!bg-elevated p-4" key={stat.label}>
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">{stat.label}</p>
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
            and hovering a cell shows the stored evidence behind it.
          </p>
        </div>

        <Card className="!bg-elevated overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">Legend</p>
            <MasteryLegend dashboard={dashboard} />
          </div>
          <MasteryHeatmapTable dashboard={dashboard} />
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
              No subskill currently has two or more students marked needs-support, so no groups are suggested.
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
    </AppShell>
  );
}
