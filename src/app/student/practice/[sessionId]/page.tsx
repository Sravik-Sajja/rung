// Practice-session route; will coordinate answer entry, tutor hints, and peer gating.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";

export default async function PracticePage({ params }: { params: Promise<{ sessionId: string }> }) { const { sessionId } = await params; return <AppShell><PagePlaceholder title="Practice: common denominators" description={`Session ${sessionId} · practice and tutor interactions will be added here.`}><div className="flex gap-2"><button className="rounded border px-3 py-2">Nudge</button><button className="rounded border px-3 py-2">Hint</button><button className="rounded border px-3 py-2">Guided step</button></div><Link href="/student/mastery" className="mt-6 inline-block text-indigo-700 underline">Finish demo practice</Link></PagePlaceholder></AppShell>; }
