// Temporary-workspace group lesson: resolves the owner's workspace cookie and
// never falls back to the sample class or its seeded groups.
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LessonPlanCard } from "@/components/teacher/lesson-plan";
import { PracticeSetCard } from "@/components/teacher/practice-set";
import { VideoRecommendationCard } from "@/components/teacher/video-recommendation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { teacherLessonDurationMinutes } from "@/lib/ai/contracts";
import { getDemoTeacherGroupPlan, groupStudentsByNeed } from "@/lib/teacher/grouping";
import { generateTeacherMatchedPractice } from "@/lib/teacher/matched-practice";
import {
  isTeacherWorkspaceDemoMode,
  resolveTeacherWorkspaceSession,
  TEACHER_WORKSPACE_COOKIE,
} from "@/lib/teacher-workspace/session";
import type { TeacherGroupPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

// Workspace IDs are intentionally isolated from the sample-class IDs. The
// reviewed video library is shared, so map each temporary workspace skill to
// its closest vetted lesson resource without ever reading sample students or
// sample mastery evidence.
const VETTED_VIDEO_GROUP_BY_WORKSPACE_SKILL: Record<string, string> = {
  "workspace-fraction-models": "equivalent-fractions",
  "workspace-equivalent-fractions": "equivalent-fractions",
  "workspace-compare-fractions": "fraction-number-line",
  "workspace-add-fractions": "add-unlike-denominators",
};

export default async function TeacherWorkspaceGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  if (!isTeacherWorkspaceDemoMode()) notFound();

  const { groupId } = await params;
  const token = (await cookies()).get(TEACHER_WORKSPACE_COOKIE)?.value;
  const result = await resolveTeacherWorkspaceSession(
    new Request("http://local/teacher-workspace", {
      headers: token ? { cookie: `${TEACHER_WORKSPACE_COOKIE}=${encodeURIComponent(token)}` } : {},
    }),
  );
  if (result.kind !== "resolved") redirect("/teacher-workspace");

  const { workspace } = result;
  const group = groupStudentsByNeed(workspace.cells, workspace.subskills).find((candidate) => candidate.id === groupId);
  if (!group) notFound();

  const subskill = workspace.subskills.find((candidate) => candidate.id === group.subskillId);
  const students = workspace.students.filter((student) => group.studentIds.includes(student.id));
  const practiceItems = await generateTeacherMatchedPractice({
    scopeId: `${workspace.classId}:${group.id}`,
    subskillId: group.subskillId,
  });
  const draft = await runtimeAiAdapter.generateTeacherLessonDraft({
    groupLabel: group.label,
    subskillName: subskill?.name ?? group.subskillId,
    studentCount: students.length,
    practiceItemCount: practiceItems.length,
    promptVersion: "teacher-workspace-lesson-v1",
  });
  const plan: TeacherGroupPlan = {
    groupId: group.id,
    objective: draft.objective,
    durationMinutes: teacherLessonDurationMinutes(draft.steps),
    materials: draft.materials.length ? draft.materials : ["Pencils", "Paper"],
    steps: draft.steps,
    checkForUnderstanding: draft.checkForUnderstanding,
    practiceItemIds: [],
    video: {
      title: "No reviewed video selected",
      provider: "Rung",
      url: "#",
      verificationNote: "Workspace mini-lessons use the teacher's paper-and-pencil practice prompts.",
    },
  };
  const matchedSampleGroupId = getDemoTeacherGroupPlan(group.subskillId)
    ? group.subskillId
    : VETTED_VIDEO_GROUP_BY_WORKSPACE_SKILL[group.subskillId];
  const matchedSamplePlan = matchedSampleGroupId ? getDemoTeacherGroupPlan(matchedSampleGroupId) : null;

  return (
    <AppShell active="teacher">
      <PageHeader
        description={`A temporary group from ${workspace.className}. Its membership updates from this workspace's stored check-in evidence.`}
        eyebrow="Teacher workspace · small group"
        title={group.label}
      />

      <section aria-labelledby="members-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-ink" id="members-heading">Students</h2>
          <Badge tone="support">Shared gap: {subskill?.name ?? group.subskillId}</Badge>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" role="list">
          {students.map((student) => (
            <li key={student.id}><Card className="!bg-elevated p-3 text-sm font-medium text-ink">{student.displayName}</Card></li>
          ))}
        </ul>
      </section>

      <div className="mt-8"><LessonPlanCard plan={plan} /></div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {practiceItems.length > 0 ? (
          <PracticeSetCard items={practiceItems} />
        ) : (
          <Card className="!bg-elevated p-6">
            <h2 className="text-lg font-semibold text-ink">Matched practice</h2>
            <p className="mt-2 text-sm text-ink-muted">Use three short paper-and-pencil problems on this skill.</p>
          </Card>
        )}
        {matchedSamplePlan ? <VideoRecommendationCard video={matchedSamplePlan.video} /> : null}
      </div>

      <Link
        className="mt-8 inline-block rounded-md text-sm font-medium text-accent underline decoration-border-strong underline-offset-4 hover:text-accent-hover"
        href="/teacher-workspace"
      >
        Back to workspace
      </Link>
    </AppShell>
  );
}
