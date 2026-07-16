import { PersistedPracticeLoop } from "@/components/student/persisted-practice-loop";

export default async function PracticePage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { sessionId } = await params;
  const { returnTo } = await searchParams;
  return <PersistedPracticeLoop sessionId={sessionId} returnTo={returnTo} />;
}
