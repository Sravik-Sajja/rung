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
          description="No class data is available for this demo class."
          eyebrow="Teacher"
          title="Class dashboard"
        />
      </AppShell>
    );
  }

  return (
    <AppShell active="teacher" width="wide">
      <PageHeader
        description={`Mastery evidence from ${dashboard.students.length} students across ${dashboard.subskills.length} fraction subskills. Cells reflect stored diagnostic and practice evidence.`}
        eyebrow="Teacher · fractions class"
        title="Ms. Rivera's fractions class"
      />
      <DashboardView dashboard={dashboard} />
    </AppShell>
  );
}
