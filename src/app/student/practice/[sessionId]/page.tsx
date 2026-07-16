import { PersistedPracticeLoop } from "@/components/student/persisted-practice-loop";
import { canonicalDemoIds } from "@/lib/demo/contracts";

export default async function PracticePage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ returnTo?: string; studentId?: string }> }) {
  const { sessionId } = await params;
  const { returnTo, studentId } = await searchParams;
  return <PersistedPracticeLoop sessionId={sessionId} returnTo={returnTo} studentId={studentId ?? canonicalDemoIds.mayaStudentId} />;
}
