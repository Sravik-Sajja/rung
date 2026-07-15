// Focused, momentum-forward frame for the student surface — lighter chrome than the teacher AppShell.
import type { ReactNode } from "react";
import Link from "next/link";

export function StudentShell({
  children,
  aside,
  exitHref = "/demo"
}: {
  children: ReactNode;
  aside?: ReactNode;
  exitHref?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      {/* Header sits one step up the elevation ladder (bg-surface + shadow-sm) so the neutral
          bg-bg canvas reads as a distinct plane underneath it, not one flat wash. */}
      <header className="border-b border-border bg-surface shadow-sm">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-5 py-3">
          <span className="inline-flex items-center gap-2 text-base font-extrabold tracking-tight text-ink">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-spark" />
            Rung
          </span>
          <div className="flex items-center gap-3">
            {aside}
            <Link href={exitHref} className="text-sm font-medium text-ink-faint hover:text-ink">
              Exit
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-8">{children}</main>

      <footer className="mx-auto w-full max-w-xl px-5 pb-6">
        <p className="font-mono text-xs text-ink-faint">Prototype · practice, not a test</p>
      </footer>
    </div>
  );
}
