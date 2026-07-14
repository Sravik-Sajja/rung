// Demo entry screen for selecting a seeded role and starting Maya's walkthrough.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";
import { demoStudents } from "@/lib/demo-data";

export default function DemoPage() {
  return <AppShell><PagePlaceholder title="Start the Rung demo" description="Choose a seeded learner. Authentication is intentionally out of scope."><div className="flex items-center justify-between rounded-lg bg-slate-50 p-4"><span>{demoStudents[0].displayName} · Grade {demoStudents[0].gradeBand}</span><Link className="rounded bg-indigo-600 px-4 py-2 text-white" href="/student/diagnostic">Start Maya’s journey</Link></div></PagePlaceholder></AppShell>;
}
