// Teacher group detail route; shows the stable, deterministic cohort alongside its cached lesson plan.
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LessonPlanCard } from "@/components/teacher/lesson-plan";
import { PracticeSetCard } from "@/components/teacher/practice-set";
import { VideoRecommendationCard } from "@/components/teacher/video-recommendation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { demoItems } from "@/lib/demo-data";
import { getDemoTeacherDashboard, getDemoTeacherGroup, getDemoTeacherGroupPlan } from "@/lib/teacher/grouping";
import { runtimeAiAdapter } from "@/lib/ai/adapter";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = getDemoTeacherGroup(groupId);
  const dashboard = getDemoTeacherDashboard();
  const seededPlan = getDemoTeacherGroupPlan(groupId);
  if (!group || !dashboard || !seededPlan) notFound();

  const students = dashboard.students.filter((student) => group.studentIds.includes(student.id));
  const subskill = dashboard.subskills.find(({ id }) => id === group.subskillId);
  const practiceItems = seededPlan.practiceItemIds.flatMap((itemId) => {
    const item = demoItems.find(({ id }) => id === itemId);
    return item ? [item] : [];
  });
  const draft = await runtimeAiAdapter.generateTeacherLessonDraft({
    groupLabel: group.label,
    subskillName: subskill?.name ?? group.subskillId,
    studentCount: group.studentIds.length,
    practiceItemCount: practiceItems.length,
    promptVersion: "teacher-lesson-v4",
  });
  const plan = { ...seededPlan, objective: draft.objective, materials: draft.materials, steps: draft.steps, checkForUnderstanding: draft.checkForUnderstanding };

  return (
    <AppShell active="teacher">
      <PageHeader
        description="This stable group is calculated from stored mastery evidence, not from a model. It changes only when new evidence is recorded."
        eyebrow="Teacher · small group"
        title={group.label}
      />

      <section aria-labelledby="members-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-ink" id="members-heading">
            Students
          </h2>
          <Badge tone="support">Shared gap: {subskill?.name ?? group.subskillId}</Badge>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" role="list">
          {students.map((student) => (
            <li key={student.id}>
              <Card className="!bg-elevated p-3 text-sm font-medium text-ink">{student.displayName}</Card>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8">
        <LessonPlanCard plan={plan} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <PracticeSetCard items={practiceItems} />
        <VideoRecommendationCard video={plan.video} />
      </div>

      <Link
        className="mt-8 inline-block rounded-md text-sm font-medium text-accent underline decoration-border-strong underline-offset-4 hover:text-accent-hover"
        href="/teacher/dashboard"
      >
        Back to dashboard
      </Link>
    </AppShell>
  );
}
