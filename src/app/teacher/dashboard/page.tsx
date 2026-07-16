// Teacher dashboard route; renders deterministic mastery evidence and groups, never model-generated results.
import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/teacher/dashboard-view";
import { PageHeader } from "@/components/ui";
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

  return (
    <AppShell active="teacher" width="wide">
      <PageHeader
        description={`Mastery evidence from ${dashboard.students.length} students across ${dashboard.subskills.length} fraction subskills. Cells reflect stored diagnostic and practice evidence — never model-generated. This prototype is not for grading.`}
        eyebrow="Teacher · fractions class"
        title="Ms. Rivera's fractions class"
      />
      <DashboardView dashboard={dashboard} />
    </AppShell>
  );
}
