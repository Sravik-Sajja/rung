// Route-level loading UI for a temporary workspace mini-lesson. It renders
// immediately while the server resolves the workspace group and its lesson.
import { AppShell } from "@/components/app-shell";

export default function LoadingWorkspaceGroupPlan() {
  return (
    <AppShell active="teacher">
      <div aria-busy="true" aria-live="polite" className="animate-pulse">
        <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
          Teacher workspace · small group
        </p>
        <div className="mt-3 h-9 w-64 rounded bg-surface-2" />
        <div className="mt-3 h-5 w-full max-w-2xl rounded bg-surface-2" />

        <section className="mt-10">
          <div className="h-6 w-24 rounded bg-surface-2" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="h-12 rounded-lg border border-border bg-surface-2" key={index} />
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-border bg-elevated p-6">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
            Preparing mini-lesson
          </p>
          <div className="mt-4 h-6 w-2/5 rounded bg-surface-2" />
          <div className="mt-4 h-4 w-full rounded bg-surface-2" />
          <div className="mt-2 h-4 w-4/5 rounded bg-surface-2" />
          <div className="mt-7 space-y-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="h-10 rounded bg-surface-2" key={index} />
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
