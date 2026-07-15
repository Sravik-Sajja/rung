// Practice-session route; will coordinate answer entry, tutor hints, and peer gating.
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";
import { PracticeFlow } from "@/components/student/practice-flow";

export default async function PracticePage({ params }: { params: Promise<{ sessionId: string }> }) { const { sessionId } = await params; return <AppShell><PagePlaceholder title="Practice: common denominators" description="Work through the selected practice items. Hints and peer support stay behind the server-side safety rules."><PracticeFlow sessionId={sessionId} /></PagePlaceholder></AppShell>; }
