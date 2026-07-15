// Landing page: states the product thesis, walks the student loop, and previews the teacher payoff.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, Eyebrow, buttonClasses } from "@/components/ui";

const masteryPreview: Array<{ label: string; swatchClass: string }> = [
  { label: "Not started", swatchClass: "bg-mastery-none" },
  { label: "Needs support", swatchClass: "bg-mastery-support" },
  { label: "Developing", swatchClass: "bg-mastery-developing" },
  { label: "Mastered", swatchClass: "bg-mastery-mastered" }
];

const studentLoop: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Diagnostic",
    body: "One graded assignment becomes a short adaptive diagnostic — a handful of questions calibrated to find exactly where understanding breaks down, not just whether the final answer was right."
  },
  {
    n: "02",
    title: "Sub-skill diagnosis",
    body: "Not “needs help with fractions.” Rung names the specific sub-skill — common denominators when adding mixed numbers — so practice can start on the actual gap."
  },
  {
    n: "03",
    title: "Targeted practice",
    body: "A problem set built around that one sub-skill, sized to close the gap, not a generic review packet covering everything the student already knows."
  },
  {
    n: "04",
    title: "AI tutor hint ladder",
    body: "Stuck on a problem? Hints escalate — a nudge, a worked step, a full explanation — always short of the answer, so the student still does the reasoning."
  },
  {
    n: "05",
    title: "Attempt-gated peer example",
    body: "A real classmate’s annotated solution unlocks only after genuine attempts, so it’s studied as a worked model instead of copied as a shortcut."
  },
  {
    n: "06",
    title: "Mastery",
    body: "The student clears the sub-skill with evidence from their own work, not a self-report — and moves on to the next rung."
  }
];

export default function HomePage() {
  return (
    <AppShell>
      <div className="space-y-20">
        <section className="pt-4">
          <Card className="!bg-elevated overflow-hidden p-8 shadow-lg sm:p-12">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div>
                <Eyebrow>Rung · differentiated math</Eyebrow>
                <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                  Meet every student on the rung they&rsquo;re actually on.
                </h1>
                <p className="mt-5 max-w-2xl text-lg text-ink-muted">
                  One assignment becomes a per-student diagnostic. Each student gets targeted practice on
                  the exact sub-skill they&rsquo;re missing — with an AI tutor and a peer example that
                  unlocks only after a real attempt. Teachers get tomorrow&rsquo;s small-group plan by
                  tonight.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link href="/demo" className={buttonClasses("primary", "lg", "shadow-md hover:shadow-lg")}>
                    Start the demo
                  </Link>
                  <Link href="/teacher/dashboard" className={buttonClasses("secondary", "lg")}>
                    View the teacher dashboard
                  </Link>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
                  Mastery, at a glance
                </p>
                <ul className="mt-3 space-y-2.5">
                  {masteryPreview.map((level) => (
                    <li className="flex items-center gap-2.5 text-sm text-ink" key={level.label}>
                      <span aria-hidden className={`h-3 w-3 shrink-0 rounded-sm ${level.swatchClass}`} />
                      {level.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-border pt-3 text-xs text-ink-faint">
                  Deterministic, stored evidence — never model-generated.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
            The student loop, one rung at a time
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Six ordered steps carry a student from a graded assignment to demonstrated mastery of
            the one skill they were actually missing.
          </p>
          <ol className="mt-10 divide-y divide-border border-t border-border">
            {studentLoop.map((step) => (
              <li key={step.n} className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start sm:gap-6">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 font-mono text-sm font-semibold tabular-nums text-ink"
                >
                  {step.n}
                </span>
                <div className="sm:flex-1">
                  <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1.5 max-w-2xl text-ink-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border pt-14">
          <Eyebrow>For teachers</Eyebrow>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
            From heatmap to tomorrow&rsquo;s plan
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Every diagnostic rolls up into a class-wide mastery heatmap. Rung clusters students by
            shared gaps automatically and hands you a ready small-group plan for tomorrow morning
            — not another dashboard to interpret at 11pm.
          </p>
          <Card className="!bg-elevated mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 p-5 font-mono text-sm uppercase tracking-wider">
            <span className="text-ink">Class heatmap</span>
            <span aria-hidden className="text-ink-faint">
              &rarr;
            </span>
            <span className="text-ink">Auto-grouped students</span>
            <span aria-hidden className="text-ink-faint">
              &rarr;
            </span>
            <span className="text-ink">Tomorrow&rsquo;s 15-minute plan</span>
          </Card>
          <div className="mt-8">
            <Link href="/teacher/dashboard" className={buttonClasses("secondary", "sm")}>
              Open the teacher dashboard
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
