// Shared page frame: Rung wordmark, student/teacher switch, and the prototype notice. Theme-aware via tokens.
import Link from "next/link";
import { RungWordmark } from "@/components/rung-wordmark";
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
        {/* Chrome keeps ONE fixed width, deliberately independent of the page's content width.
            Tying it to `maxW` made the wordmark shift horizontally between pages (455px on the
            narrow landing page vs 167px on the wide dashboard) — chrome is the frame content moves
            inside of, so it must not move. A stable wide bar also stops the contents huddling in a
            narrow column while the bar's own background spans the whole viewport. */}
        <div className="mx-auto flex max-w-wide items-center justify-between px-6 py-3.5">
          <Link href="/" className="shrink-0">
            <RungWordmark />
          </Link>
          <nav className="flex shrink-0 items-center gap-1 text-sm">
            <Link
              href="/demo"
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
