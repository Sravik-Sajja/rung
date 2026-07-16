// Landing page: states the product thesis, walks the student loop, and previews the teacher payoff.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { SectionConnector } from "@/components/landing/section-connector";
import { Badge, Card, Eyebrow, buttonClasses } from "@/components/ui";

const masteryPreview: Array<{ label: string; swatchClass: string }> = [
  { label: "Not started", swatchClass: "bg-mastery-none" },
  { label: "Needs support", swatchClass: "bg-mastery-support" },
  { label: "Developing", swatchClass: "bg-mastery-developing" },
  { label: "Mastered", swatchClass: "bg-mastery-mastered" }
];

// A small illustrative class heatmap — four students (rows) by four sub-skills (columns) — built
// from the same four mastery tokens as the legend below it, so "at a glance" actually shows one.
const heatmapPreview: string[][] = [
  [masteryPreview[3].swatchClass, masteryPreview[2].swatchClass, masteryPreview[1].swatchClass, masteryPreview[0].swatchClass],
  [masteryPreview[2].swatchClass, masteryPreview[3].swatchClass, masteryPreview[3].swatchClass, masteryPreview[1].swatchClass],
  [masteryPreview[1].swatchClass, masteryPreview[1].swatchClass, masteryPreview[2].swatchClass, masteryPreview[3].swatchClass],
  [masteryPreview[0].swatchClass, masteryPreview[2].swatchClass, masteryPreview[3].swatchClass, masteryPreview[2].swatchClass]
];

// Decorative ladder rungs for the side margins on very wide screens: the climb motif makes the
// quiet space beside the centered column read as designed, not empty. Purely visual — aria-hidden.
const RUNG_MOTIF_OPACITIES = [0.16, 0.3, 0.45, 0.62, 0.8];

function RungMotif({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 hidden flex-col justify-center gap-10 xl:flex 2xl:gap-12 ${
        side === "left" ? "left-2 2xl:left-10" : "right-2 2xl:right-10"
      }`}
    >
      {RUNG_MOTIF_OPACITIES.map((opacity, index) => (
        <span key={index} className="h-1 w-12 rounded-full bg-border-strong 2xl:w-16" style={{ opacity }} />
      ))}
    </div>
  );
}

function MiniHeatmap({ rows }: { rows: string[][] }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" role="presentation">
      {rows.flatMap((row, rowIndex) =>
        row.map((swatchClass, colIndex) => (
          <span
            key={`${rowIndex}-${colIndex}`}
            aria-hidden
            className={`h-4 w-4 rounded-sm sm:h-5 sm:w-5 ${swatchClass}`}
          />
        ))
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <>
        <section className="relative pb-20 pt-6 sm:pt-10">
          {/* Soft spark-gold pool of light behind the hero card, echoing the diagnostic surface's
              ambient treatment so the marketing page reads as the same designed canvas. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-full max-w-[52rem] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--spark-soft), transparent)" }}
          />
          <RungMotif side="left" />
          <RungMotif side="right" />

          <Card className="animate-rise !bg-elevated relative overflow-hidden p-8 shadow-lg sm:p-12">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div>
                <Eyebrow>Rung</Eyebrow>
                <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                  Meet every student on the rung they&rsquo;re actually on.
                </h1>
                <p className="mt-5 max-w-2xl text-lg text-ink-muted">
                  One assignment becomes a per-student diagnostic. Each student gets targeted practice on
                  the exact sub-skill they&rsquo;re missing, with an AI tutor and a peer example that
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
                <div className="mt-4">
                  <MiniHeatmap rows={heatmapPreview} />
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                  {masteryPreview.map((level) => (
                    <li className="flex items-center gap-2 text-xs text-ink" key={level.label}>
                      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${level.swatchClass}`} />
                      {level.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-border pt-3 text-xs text-ink-faint">
                  Deterministic, stored evidence, never model-generated.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Hero -> How it works: the spine continues through the gap instead of stopping dead. */}
        <SectionConnector from="transparent" to="var(--border)" />

        <HowItWorksSection />

        {/* How it works -> For teachers: the rail just resolved to mastery green at the 06 chip;
            this stub carries that green down and lets it dissolve — the evidence a student
            generates is what flows into the teacher's view next. */}
        <SectionConnector from="var(--m-mastered)" to="transparent" />

        <section className="relative overflow-hidden py-20 lg:py-24">
          {/* Quiet echo of the hero's ambient glow — subtler, green-tinted, seated behind the
              three-stage diagram rather than the whole section. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[13rem] h-64 w-full max-w-[42rem] -translate-x-1/2 -translate-y-1/2 opacity-40 blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
          />

          <div className="lg:mx-auto lg:max-w-2xl lg:text-center">
            <Eyebrow>For teachers</Eyebrow>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
              From heatmap to tomorrow&rsquo;s plan
            </h2>
            <p className="mt-3 max-w-2xl text-ink-muted lg:mx-auto">
              Every diagnostic rolls up into a class-wide mastery heatmap. Rung clusters students by
              shared gaps automatically and hands you a ready small-group plan for tomorrow morning,
              not another dashboard to interpret at 11pm.
            </p>
          </div>

          <div className="relative mt-8 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
            <Card className="!bg-elevated flex-1 p-5">
              <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
                Class heatmap
              </p>
              <div className="mt-3">
                <MiniHeatmap rows={heatmapPreview} />
              </div>
            </Card>

            <span aria-hidden className="mx-auto rotate-90 text-lg text-ink-faint lg:rotate-0">
              &rarr;
            </span>

            <Card className="!bg-elevated flex-1 p-5">
              <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
                Auto-grouped students
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="support">4 · common denominators</Badge>
                <Badge tone="developing">6 · mixed numbers</Badge>
                <Badge tone="mastered">3 · ready to extend</Badge>
              </div>
            </Card>

            <span aria-hidden className="mx-auto rotate-90 text-lg text-ink-faint lg:rotate-0">
              &rarr;
            </span>

            <Card className="!bg-elevated flex-1 p-5">
              <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
                Tomorrow&rsquo;s 15-minute plan
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink">
                <li className="flex items-start gap-2">
                  <span aria-hidden className="mt-0.5 text-accent">
                    &#10003;
                  </span>
                  Pull the common-denominator group first
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden className="mt-0.5 text-accent">
                    &#10003;
                  </span>
                  Mini-lesson on mixed numbers
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden className="mt-0.5 text-accent">
                    &#10003;
                  </span>
                  Extension set for students ready to move on
                </li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Closing CTA band: the page's last word, echoing the hero's glow so the spine that ran
            down through the whole page resolves in an ending rather than a dead final button. */}
        <section className="relative overflow-hidden py-20 lg:py-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[22rem] w-full max-w-[48rem] -translate-x-1/2 -translate-y-1/2 opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, var(--spark-soft), transparent)" }}
          />
          <div className="relative mx-auto max-w-2xl text-center">
            <Eyebrow>Ready when you are</Eyebrow>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Meet your students where they are.
            </h2>
            <p className="mt-4 text-lg text-ink-muted">
              Practice, not a test: try the student loop yourself, or open the class view
              teachers check before tomorrow&rsquo;s lesson.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/demo" className={buttonClasses("primary", "lg", "shadow-md hover:shadow-lg")}>
                Start the demo
              </Link>
              <Link href="/teacher/dashboard" className={buttonClasses("secondary", "lg")}>
                Open the teacher dashboard
              </Link>
            </div>
          </div>
        </section>
      </>
    </AppShell>
  );
}
