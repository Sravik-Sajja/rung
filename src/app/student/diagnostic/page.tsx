// Student diagnostic route; will present and submit one assessment item at a time.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";

export default function DiagnosticPage() { return <AppShell><PagePlaceholder title="Fractions check-in" description="Diagnostic flow placeholder: one validated item at a time, with server-side scoring."><p className="rounded bg-slate-50 p-4">1/5 · What is 1/3 + 1/4?</p><Link href="/student/diagnosis" className="mt-4 inline-block rounded bg-indigo-600 px-4 py-2 text-white">Submit demo answer</Link></PagePlaceholder></AppShell>; }
