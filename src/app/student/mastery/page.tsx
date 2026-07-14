// Student mastery summary; will show plain-language status after practice.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";

export default function MasteryPage() { return <AppShell><PagePlaceholder title="Your skill status" description="Common denominators: developing — this skill will come back."><Link href="/teacher/dashboard" className="rounded bg-indigo-600 px-4 py-2 text-white">Switch to teacher view</Link></PagePlaceholder></AppShell>; }
