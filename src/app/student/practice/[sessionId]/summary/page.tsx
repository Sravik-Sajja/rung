import { PracticeSummaryPage } from "@/components/student/practice-summary";
import { redirect } from "next/navigation";

/** Route wrapper for a completed practice plan's learner-facing recap. */
export default async function PracticeSummaryRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ returnTo?: string; studentId?: string }>;
}) {
  const { sessionId } = await params;
  const { returnTo, studentId } = await searchParams;
  if (!studentId) redirect("/demo");
  return <PracticeSummaryPage sessionId={sessionId} studentId={studentId} returnTo={returnTo} />;
}
