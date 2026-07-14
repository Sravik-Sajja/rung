// Minimal shared page frame with Rung branding and the prototype notice.
import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-4xl p-6"><header className="mb-8 flex items-center justify-between"><Link href="/demo" className="text-xl font-bold">Rung</Link><span className="text-sm text-slate-500">Prototype · not for grading</span></header>{children}</main>;
}
