// Focused, momentum-forward frame for the student surface — lighter chrome than the teacher AppShell.
import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/components/ui";
import { RungWordmark } from "@/components/rung-wordmark";
import { ThemeToggle } from "@/components/theme-toggle";

// "focused" is the default reading column for a single flow; "wide" opens the frame for layouts
// that fill the horizontal space on purpose (e.g. a two-column question + context split). "wide"
// scales in steps with the viewport so big monitors fill out while small screens stay comfortable.
const widthClass = {
  focused: "max-w-xl",
  wide: "max-w-2xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[88rem]"
} as const;

export function StudentShell({
  children,
  aside,
  exitHref = "/demo",
  size = "focused"
}: {
  children: ReactNode;
  aside?: ReactNode;
  exitHref?: string;
  size?: keyof typeof widthClass;
}) {
  const container = cn("mx-auto w-full px-5", widthClass[size]);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      {/* Header sits one step up the elevation ladder (bg-surface + shadow-sm) so the neutral
          bg-bg canvas reads as a distinct plane underneath it, not one flat wash. */}
      <header className="border-b border-border bg-surface shadow-sm">
        <div className={cn(container, "flex items-center justify-between gap-4 py-3")}>
          <Link href="/" className="shrink-0" aria-label="Rung home">
            <RungWordmark size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            {aside}
            <ThemeToggle />
            <Link href={exitHref} className="text-sm font-medium text-ink-faint hover:text-ink">
              Exit
            </Link>
          </div>
        </div>
      </header>

      <main className={cn(container, "flex flex-1 flex-col py-8")}>{children}</main>

      <footer className={cn(container, "pb-6")}>
        <p className="font-mono text-xs text-ink-faint">Prototype · practice, not a test</p>
      </footer>
    </div>
  );
}
