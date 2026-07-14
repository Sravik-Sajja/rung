// Teacher group detail route; will show its stable members, plan, and vetted video.
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) { const { groupId } = await params; return <AppShell><PagePlaceholder title="Common-denominator group" description={`Group ${groupId} · cached mini-lesson, practice set, and vetted video will render here.`} /></AppShell>; }
