// Teacher group detail route; shows the stable, deterministic cohort before a cached plan is added.
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";
import { demoItems } from "@/lib/demo-data";
import { getDemoTeacherDashboard, getDemoTeacherGroup, getDemoTeacherGroupPlan } from "@/lib/teacher/grouping";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = getDemoTeacherGroup(groupId);
  const dashboard = getDemoTeacherDashboard();
  const plan = getDemoTeacherGroupPlan(groupId);
  if (!group || !dashboard || !plan) notFound();
  const students = dashboard.students.filter((student) => group.studentIds.includes(student.id));
  const subskill = dashboard.subskills.find(({ id }) => id === group.subskillId);
  const practiceItems = plan.practiceItemIds.flatMap((itemId) => {
    const item = demoItems.find(({ id }) => id === itemId);
    return item ? [item] : [];
  });

  return <AppShell><PagePlaceholder title={group.label} description={`Shared gap: ${subskill?.name ?? group.subskillId}. This stable group is calculated from stored mastery evidence.`}>
    <section><h2 className="text-lg font-semibold">Students</h2><ul className="mt-2 grid gap-2 sm:grid-cols-2">{students.map((student) => <li className="rounded border border-slate-200 p-3" key={student.id}>{student.displayName}</li>)}</ul></section>
    <section className="mt-6 rounded-lg border border-indigo-100 bg-indigo-50 p-5" aria-labelledby="lesson-plan-heading"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold" id="lesson-plan-heading">Tomorrow’s mini-lesson</h2><span className="text-sm font-medium text-indigo-900">{plan.durationMinutes} minutes</span></div><p className="mt-2"><span className="font-medium">Objective:</span> {plan.objective}</p><p className="mt-3 text-sm"><span className="font-medium">Materials:</span> {plan.materials.join(", ")}</p><ol className="mt-4 space-y-3">{plan.steps.map((step, index) => <li className="flex gap-3" key={step.activity}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-indigo-900">{index + 1}</span><p><span className="font-medium">{step.minutes} min:</span> {step.activity}</p></li>)}</ol><p className="mt-4 rounded bg-white p-3 text-sm"><span className="font-medium">Check for understanding:</span> {plan.checkForUnderstanding}</p></section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 p-4"><h2 className="font-semibold">Matched practice</h2><ul className="mt-2 space-y-2 text-sm">{practiceItems.map((item) => <li className="rounded bg-slate-50 p-2" key={item.id}>{item.prompt}</li>)}</ul></div><div className="rounded-lg border border-slate-200 p-4"><h2 className="font-semibold">Vetted video</h2><p className="mt-2 text-sm font-medium">{plan.video.title}</p><p className="text-sm text-slate-600">{plan.video.provider}</p><p className="mt-3 text-xs text-slate-500">{plan.video.verificationNote}</p></div></section>
    <Link className="mt-6 inline-block text-indigo-700 underline" href="/teacher/dashboard">Back to dashboard</Link>
  </PagePlaceholder></AppShell>;
}
