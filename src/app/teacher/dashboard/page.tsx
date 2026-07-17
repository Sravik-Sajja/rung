// Teacher dashboard route; renders deterministic mastery evidence and groups, never model-generated results.
import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/teacher/dashboard-view";
import { PageHeader } from "@/components/ui";
import { getTeacherDashboard } from "@/lib/teacher/repository";

// The walkthrough participant is added at runtime, so this page must not be
// statically cached between the student and teacher moments of the demo.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dashboard = await getTeacherDashboard();

  if (!dashboard) {
    return (
      <AppShell active="teacher">
        <PageHeader
          description="The fixed sample class is unavailable. Create a teacher workspace to make a separate fictional class."
          eyebrow="Sample teacher view"
          title="Sample class dashboard"
        />
      </AppShell>
    );
  }

  return (
    <AppShell active="teacher" width="wide">
      <PageHeader
        description={`Fixed sample data from ${dashboard.students.length} students across ${dashboard.subskills.length} fraction subskills. Public walkthrough learners never appear here.`}
        eyebrow="Sample teacher view · fractions class"
        title="Sample: Ms. Rivera's fractions class"
      />
      <DashboardView dashboard={dashboard} />
    </AppShell>
  );
}
