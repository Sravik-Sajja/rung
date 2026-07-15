// Teacher dashboard route; renders deterministic mastery evidence and groups, never model-generated results.
import Link from "next/link";
import { Fragment } from "react";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";
import { getDemoTeacherDashboard } from "@/lib/teacher/grouping";
import type { MasteryLevel } from "@/lib/types";

const levelStyles: Record<MasteryLevel, string> = {
  not_started: "bg-slate-100 text-slate-700",
  needs_support: "bg-red-100 text-red-900",
  developing: "bg-yellow-100 text-yellow-900",
  mastered: "bg-emerald-100 text-emerald-900"
};

const levelLabels: Record<MasteryLevel, string> = {
  not_started: "Not started",
  needs_support: "Needs support",
  developing: "Developing",
  mastered: "Mastered"
};

export default function DashboardPage() {
  const dashboard = getDemoTeacherDashboard();
  if (!dashboard) return null;

  return <AppShell><PagePlaceholder title="Ms. Rivera’s fractions class" description="Mastery evidence from diagnostic and practice responses. This prototype is not for grading.">
    <section aria-labelledby="heatmap-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="heatmap-heading" className="text-lg font-semibold">Skill-by-student heatmap</h2></div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="grid min-w-[760px] grid-cols-[150px_repeat(5,minmax(110px,1fr))]">
          <div className="border-b border-r bg-slate-50 p-3 text-sm font-medium">Student</div>
          {dashboard.subskills.map((subskill) => <div className="border-b border-r bg-slate-50 p-3 text-center text-xs font-medium" key={subskill.id}>{subskill.name}</div>)}
          {dashboard.students.map((student) => <Fragment key={student.id}>
            <div className="border-b border-r p-3 text-sm font-medium" key={`${student.id}-name`}>{student.displayName}</div>
            {dashboard.subskills.map((subskill) => {
              const cell = dashboard.cells.find((candidate) => candidate.studentId === student.id && candidate.subskillId === subskill.id);
              if (!cell) return <div className="border-b border-r p-2" key={`${student.id}-${subskill.id}`} />;
              return <div className="border-b border-r p-2" key={`${student.id}-${subskill.id}`}><span className={`block rounded px-2 py-1 text-center text-xs font-medium ${levelStyles[cell.level]}`} title={cell.evidenceSummary}>{levelLabels[cell.level]}</span></div>;
            })}
          </Fragment>)}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">{Object.entries(levelLabels).map(([level, label]) => <span className={`rounded px-2 py-1 ${levelStyles[level as MasteryLevel]}`} key={level}>{label}</span>)}</div>
    </section>
    <section className="mt-8" aria-labelledby="groups-heading"><h2 id="groups-heading" className="text-lg font-semibold">Suggested small groups</h2><p className="mt-1 text-sm text-slate-600">Students are grouped when two or more share a stored needs-support status.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{dashboard.groups.map((group) => <Link className="rounded-lg border border-slate-200 p-4 transition hover:border-indigo-400 hover:bg-indigo-50" href={`/teacher/groups/${group.id}`} key={group.id}><p className="font-medium">{group.label}</p><p className="mt-1 text-sm text-slate-600">{group.studentIds.length} students · view group plan</p></Link>)}</div></section>
  </PagePlaceholder></AppShell>;
}
