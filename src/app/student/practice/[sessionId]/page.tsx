import { PersistedPracticeLoop } from "@/components/student/persisted-practice-loop";
import { redirect } from "next/navigation";

export default async function PracticePage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ returnTo?: string; studentId?: string }> }) {
  const { sessionId } = await params;
  const { returnTo, studentId } = await searchParams;
  if (!studentId) redirect("/demo");
  return <PersistedPracticeLoop sessionId={sessionId} returnTo={returnTo} studentId={studentId} />;
}
