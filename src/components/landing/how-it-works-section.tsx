// Landing page "How it works" section: the six-step student loop. Each step keeps its original
// copy verbatim and gains a compact product vignette (see ./step-vignettes) so the section shows
// the real UI instead of just describing it. Server component — static markup, no interactivity.
import { Eyebrow, cn } from "@/components/ui";
import { StepVignette } from "./step-vignettes";

const studentLoop: Array<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Join and check in",
    body: "A student joins a teacher workspace with a code, then completes a short check-in that captures answer evidence without treating it like a grade."
  },
  {
    n: "02",
    title: "Specific skills",
    body: "Rung records evidence by sub-skill, so a teacher can see the exact concept that needs attention instead of one vague subject-wide label."
  },
  {
    n: "03",
    title: "Targeted practice",
    body: "Students choose a focused practice plan for each assessed skill that is not yet mastered. Missed skills appear first, with new problems generated safely for that skill."
  },
  {
    n: "04",
    title: "AI tutor hint ladder",
    body: "Stuck on a problem? Support progresses from a reflective nudge, to a strategy hint, to one guided step—without giving the answer or a completed solution."
  },
  {
    n: "05",
    title: "Evidence updates",
    body: "Answers are scored deterministically. Diagnostic and practice evidence update the student&rsquo;s class-specific mastery cells as they work."
  },
  {
    n: "06",
    title: "Teacher action",
    body: "The teacher sees the heatmap, grouped shared needs, an AI-assisted mini-lesson, and quick actions for follow-up practice or reminders."
  }
];

export function HowItWorksSection() {
  return (
    <section className="py-20 lg:py-24">
      {/* Heading sits on the rail's center axis from lg up (the rail centers there too); on
          mobile it stays left-aligned to match the left-timeline rail below it. */}
      <div className="lg:mx-auto lg:max-w-2xl lg:text-center">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          From check-in to next step
        </h2>
        <p className="mt-3 max-w-2xl text-ink-muted lg:mx-auto">
          Six connected steps carry a student&rsquo;s evidence from a short check-in to a teacher&rsquo;s
          clear next move.
        </p>
      </div>

      <div className="relative mt-12 lg:mt-16">
        {/* The ladder rail: a line running behind the numbered chips — left-aligned as a timeline
            on narrow screens, centered between the alternating steps from lg up. It fades in from
            nothing under the heading, holds a neutral border tone through the middle steps, then
            blends toward mastery green as it approaches the payoff chip (06) and fades out again
            rather than running past it as a flat line into empty space below. Percentage stops are
            tuned to a six-item list rather than measured, since item heights vary responsively. */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-[17px] top-0 w-0.5 lg:left-1/2 lg:-translate-x-1/2"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, var(--border) 15%, var(--border) 75%, var(--m-mastered) 92%, transparent 100%)"
          }}
        />
        <ol className="relative">
          {studentLoop.map((step, index) => {
            // Steps zigzag from lg up: odd steps carry text left / vignette right, even steps swap.
            const isEven = index % 2 === 1;
            // Step 06 is the loop's payoff — its chip gets the mastered-green treatment instead of
            // the neutral numbering the other five steps share.
            const isPayoff = step.n === "06";
            return (
              <li key={step.n} className="relative mt-12 first:mt-0 lg:mt-16">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-1 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold tabular-nums lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
                    isPayoff
                      ? "bg-mastery-mastered text-mastery-mastered-fg"
                      : "border border-border-strong bg-surface-2 text-ink"
                  )}
                >
                  {step.n}
                </span>

                <div className="flex flex-col gap-4 pl-14 lg:flex-row lg:items-center lg:gap-16 lg:pl-0">
                  <div className={cn("max-w-md lg:flex-1", isEven && "lg:order-2")}>
                    <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-ink-muted">{step.body}</p>
                  </div>
                  <div
                    className={cn(
                      "lg:flex lg:flex-1",
                      isEven ? "lg:order-1 lg:justify-end" : "lg:justify-start"
                    )}
                  >
                    <StepVignette n={step.n} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
