// Shared page frame: Rung wordmark, student/teacher switch, and the prototype notice. Theme-aware via tokens.
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({
  children,
  active,
  width = "default"
}: {
  children: React.ReactNode;
  active?: "student" | "teacher";
  width?: "default" | "wide";
}) {
  const maxW = width === "wide" ? "max-w-wide" : "max-w-content";
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-border bg-surface shadow-sm">
        <div className={`mx-auto flex ${maxW} items-center justify-between px-6 py-3.5`}>
          <Link href="/demo" className="flex shrink-0 items-baseline gap-2">
            <span className="text-lg font-extrabold tracking-tight text-ink">Rung</span>
            {/* Subtitle yields below sm so the nav + theme toggle fit without horizontal overflow. */}
            <span className="hidden font-mono text-[10px] uppercase tracking-wider text-ink-faint sm:inline">
              differentiated math
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 text-sm">
            <Link
              href="/student/diagnostic"
              className={`rounded-md px-3 py-1.5 transition-colors ${
                active === "student" ? "bg-accent-soft font-medium text-accent" : "text-ink-muted hover:text-ink"
              }`}
            >
              Student
            </Link>
            <Link
              href="/teacher/dashboard"
              className={`rounded-md px-3 py-1.5 transition-colors ${
                active === "teacher" ? "bg-accent-soft font-medium text-accent" : "text-ink-muted hover:text-ink"
              }`}
            >
              Teacher
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className={`mx-auto ${maxW} px-6 py-10`}>{children}</main>

      <footer className={`mx-auto ${maxW} px-6 pb-10`}>
        <p className="font-mono text-xs text-ink-faint">
          Prototype · not for grading · not a substitute for teacher judgment
        </p>
      </footer>
    </div>
  );
}
