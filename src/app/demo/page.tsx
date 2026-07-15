// Demo entry screen for selecting a seeded role and starting Maya's walkthrough.
import Link from "next/link";
import { StudentShell } from "@/components/student/surface/student-shell";
import { Badge, Card, Eyebrow, buttonClasses } from "@/components/ui";
import { demoStudents } from "@/lib/demo-data";

export default function DemoPage() {
  const [maya, ...rest] = demoStudents;

  return (
    <StudentShell exitHref="/">
      <section className="flex flex-1 flex-col gap-10">
        <div className="max-w-lg animate-rise">
          <Eyebrow className="mb-2">Prototype walkthrough</Eyebrow>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Let&rsquo;s find your next climb.
          </h1>
          <p className="mt-4 text-lg text-ink-muted">
            Every learner starts on a different rung — Rung meets you on yours. This walkthrough
            follows Maya Chen through a quick check-in, a focused practice set, and an honest look
            at what she&rsquo;s climbed so far.
          </p>
        </div>

        {/* Primary hero CTA: bg-elevated + shadow-lg makes this the one thing that visibly floats
            off the bg-bg canvas, so the start action is unmistakably the focal point. */}
        <Card className="animate-rise flex flex-col gap-6 border-border-strong bg-elevated p-6 shadow-lg sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border-strong bg-accent-soft font-mono text-base font-bold text-accent">
              MC
            </div>
            <div>
              <p className="text-xl font-bold text-ink">{maya.displayName}</p>
              <p className="mt-0.5 text-sm text-ink-muted">Fractions unit &middot; ready when you are</p>
            </div>
          </div>
          <Link href="/student/diagnostic" className={buttonClasses("focus", "lg")}>
            Start the climb
          </Link>
        </Card>

        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-faint">
            Other seeded learners in this class
          </p>
          <ul className="flex flex-wrap gap-2">
            {rest.map((student) => (
              <li key={student.id}>
                <Badge tone="neutral">{student.displayName}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </StudentShell>
  );
}
