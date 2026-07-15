import { PersistedPracticeLoop } from "@/components/student/persisted-practice-loop";

export default async function PracticePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <PersistedPracticeLoop sessionId={sessionId} />;
}
