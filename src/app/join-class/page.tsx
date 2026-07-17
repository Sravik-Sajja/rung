import { Suspense } from "react";
import { StudentShell } from "@/components/student/surface/student-shell";
import { StudentJoinForm } from "@/components/teacher-workspace/student-join-form";

export default function JoinClassPage() {
  return (
    <StudentShell exitHref="/">
      <section className="relative flex flex-1 items-center justify-center">
        {/* Soft spark-gold pool of light behind the card, matching the diagnostic stage. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-full max-w-[52rem] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--spark-soft), transparent)" }}
        />
        <div className="relative">
          <Suspense fallback={<p className="text-ink-muted">Loading class join…</p>}><StudentJoinForm /></Suspense>
        </div>
      </section>
    </StudentShell>
  );
}
