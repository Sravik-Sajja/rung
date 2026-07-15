// Student diagnosis route; explains the deterministic gap and links to practice.
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";
import { DiagnosisResult } from "@/components/student/diagnosis-result";

export default async function DiagnosisPage({ searchParams }: { searchParams: Promise<{ sessionId?: string }> }) { const { sessionId } = await searchParams; return <AppShell><PagePlaceholder title="Your next useful step" description="This next step is based on the selected diagnostic distractor, not just a right-or-wrong score."><DiagnosisResult sessionId={sessionId} /></PagePlaceholder></AppShell>; }
