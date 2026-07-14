// Student diagnosis route; explains the deterministic gap and links to practice.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";

export default function DiagnosisPage() { return <AppShell><PagePlaceholder title="Your next useful step" description="Observation: On two questions, the denominators were added directly."><p>Next step: practice finding a common denominator before adding.</p><Link href="/student/practice/demo-session" className="mt-4 inline-block rounded bg-indigo-600 px-4 py-2 text-white">Start practice</Link></PagePlaceholder></AppShell>; }
