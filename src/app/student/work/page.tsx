"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentShell } from "@/components/student/surface/student-shell";
import { Card, Eyebrow, PageHeader } from "@/components/ui";
import { formatCompletedAt, groupItemsById, WorkItemReview } from "@/components/student/work-item-review";
import type { StudentWorkSession } from "@/lib/student/work-history";

function sessionTitle(session: StudentWorkSession): string {
  return session.kind === "diagnostic" ? "Diagnostic check-in" : session.planTitle ?? "Focused practice";
}

/** Small rotating disclosure chevron — a plain SVG glyph, not an emoji section marker. */
function DisclosureChevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 motion-reduce:transition-none group-open/session:rotate-180"
    >
      <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SessionCard({ session }: { session: StudentWorkSession }) {
  const groups = groupItemsById(session.items);
  return (
    <Card className="p-5">
      <details className="group/session">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 rounded-md">
          <div>
            <Eyebrow className="mb-1">{session.kind === "diagnostic" ? "Diagnostic" : "Focused practice"}</Eyebrow>
            <p className="text-lg font-semibold text-ink">{sessionTitle(session)}</p>
            <p className="text-sm text-ink-muted">{formatCompletedAt(session.completedAt)}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-mono text-sm font-semibold tabular-nums text-ink">
              {session.firstTryCount} of {session.totalCount} first try
            </p>
            <DisclosureChevron />
          </div>
        </summary>
        <ul className="mt-4 space-y-4">
          {groups.map((group) => (
            <WorkItemReview key={group.itemId} group={group} />
          ))}
        </ul>
      </details>
    </Card>
  );
}

function WorkContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId");
  const router = useRouter();
  const [sessions, setSessions] = useState<StudentWorkSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      router.replace("/demo");
      return;
    }
    fetch(`/api/students/${encodeURIComponent(studentId)}/work`)
      .then(async (response) => (response.ok ? response.json() : Promise.reject(new Error((await response.json()).error))))
      .then((data: { sessions: StudentWorkSession[] }) => setSessions(data.sessions))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load your work"));
  }, [router, studentId]);

  if (!sessions) {
    return (
      <StudentShell studentId={studentId ?? undefined}>
        <section className="flex-1">
          <p className="text-ink-muted">{error ?? "Loading your work…"}</p>
        </section>
      </StudentShell>
    );
  }

  return (
    <StudentShell studentId={studentId ?? undefined}>
      <section className="flex flex-1 flex-col gap-6">
        <PageHeader
          eyebrow="Your history"
          title="My work"
          description="Every check-in and practice set you've completed, question by question."
        />
        {sessions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-ink-muted">No completed work yet — finish a check-in or practice set to see it here.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <SessionCard key={session.sessionId} session={session} />
            ))}
          </div>
        )}
      </section>
    </StudentShell>
  );
}

export default function WorkPage() {
  return (
    <Suspense
      fallback={
        <StudentShell>
          <section className="flex-1">
            <p className="text-ink-muted">Loading your work…</p>
          </section>
        </StudentShell>
      }
    >
      <WorkContent />
    </Suspense>
  );
}
