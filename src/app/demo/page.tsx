// Demo entry screen for starting a cookie-bound temporary learner walkthrough.
import { StudentShell } from "@/components/student/surface/student-shell";
import { StartClimbForm } from "@/components/demo/start-climb-form";
import { Badge, Card, Eyebrow } from "@/components/ui";

// Decorative ladder rungs for the side margins on very wide screens — mirrors the diagnostic
// intro's motif so this "step zero" screen feels like the same composition. Purely visual —
// aria-hidden. Duplicated locally (not imported) per this page's file-ownership boundary.
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
        <span
          key={index}
          className="h-1 w-12 rounded-full bg-border-strong 2xl:w-16"
          style={{ opacity }}
        />
      ))}
    </div>
  );
}

export default function DemoPage() {
  return (
    <StudentShell exitHref="/" size="wide">
      {/* One centered composition — headline above, the Maya card as the single lit focal
          object below — so this screen reads as the same house style as the diagnostic intro
          it leads into, rather than left-anchored content floating in a wide void. */}
      <section className="relative flex flex-1 items-center justify-center">
        {/* Soft spark-gold pool of light behind the card so the focal object sits in a lit spot
            on the canvas instead of floating on one flat wash. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-full max-w-[52rem] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--spark-soft), transparent)" }}
        />
        <RungMotif side="left" />
        <RungMotif side="right" />

        <div className="relative mx-auto w-full max-w-2xl py-8">
          <div className="animate-rise mx-auto max-w-lg text-center">
            <Eyebrow className="mb-3">Prototype walkthrough</Eyebrow>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
              Let&rsquo;s find your next climb.
            </h1>
            <p className="mt-4 text-pretty text-lg text-ink-muted">
              Every learner starts on a different rung. Enter a name to take a quick check-in, work
              through focused practice, and see your own learning evidence appear in the class view.
            </p>
          </div>

          {/* The name step creates a server-owned temporary learner before the
              student route begins. The existing visual treatment stays intact. */}
          <Card className="animate-rise mt-10 flex flex-col items-center gap-5 rounded-2xl border-border-strong bg-elevated p-8 text-center shadow-lg">
            <StartClimbForm />
          </Card>

          <div className="mt-8 text-center">
            <Badge tone="neutral">Temporary walkthrough data</Badge>
            <p className="mt-2 text-sm text-ink-muted">Your name and progress are visible only for this demo session.</p>
          </div>
        </div>
      </section>
    </StudentShell>
  );
}
