"use client";

// Small client subcomponent so the otherwise-plain `StudentShell` doesn't need "use client"
// itself. Resolves the "Plan" link via the current-diagnostic API (WS1c): a student who hasn't
// completed a diagnostic yet has no plan hub to return to, so that link is disabled rather than
// pointing somewhere broken. Active route is read via `usePathname` so this must stay a client
// component.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";

type NavLink = {
  label: string;
  href: string | null;
  match: string;
  disabledTitle?: string;
};

export function StudentNav({ studentId }: { studentId: string }) {
  const pathname = usePathname();
  // `undefined` = still loading (safe default: link stays disabled), `null` = confirmed this
  // student has no completed diagnostic yet.
  const [diagnosticSessionId, setDiagnosticSessionId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/students/${encodeURIComponent(studentId)}/current-diagnostic`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Could not load current diagnostic"))))
      .then((data: { diagnosticSessionId: string | null }) => {
        if (!cancelled) setDiagnosticSessionId(data.diagnosticSessionId);
      })
      .catch(() => {
        if (!cancelled) setDiagnosticSessionId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const studentQuery = `studentId=${encodeURIComponent(studentId)}`;
  const planHref = diagnosticSessionId
    ? `/student/diagnosis?diagnosticSessionId=${encodeURIComponent(diagnosticSessionId)}&${studentQuery}`
    : null;

  const links: NavLink[] = [
    { label: "Plan", href: planHref, match: "/student/diagnosis", disabledTitle: "Finish a check-in to see your plan" },
    { label: "My Work", href: `/student/work?${studentQuery}`, match: "/student/work" },
    { label: "Progress", href: `/student/mastery?${studentQuery}`, match: "/student/mastery" },
  ];

  return (
    <nav aria-label="Student navigation" className="flex items-center gap-4">
      {links.map((link) => {
        const isActive = pathname === link.match;
        if (!link.href) {
          return (
            <span
              key={link.label}
              className="font-mono text-xs font-medium uppercase tracking-wider text-ink-faint opacity-60"
              aria-disabled="true"
              title={link.disabledTitle}
            >
              {link.label}
            </span>
          );
        }
        return (
          <Link
            key={link.label}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "font-mono text-xs font-medium uppercase tracking-wider transition-colors",
              isActive ? "text-ink" : "text-ink-faint hover:text-ink"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
