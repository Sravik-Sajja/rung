// 15-20 minute mini-lesson plan card: objective, materials, timed steps, and a check for understanding.
import { Badge, Card, Eyebrow } from "@/components/ui";
import type { TeacherGroupPlan } from "@/lib/types";

export function LessonPlanCard({ plan }: { plan: TeacherGroupPlan }) {
  return (
    <section aria-labelledby="lesson-plan-heading">
      <Card className="!bg-elevated p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-4">
          <div>
            <Eyebrow>Tomorrow's mini-lesson</Eyebrow>
            <h2 className="mt-1 text-lg font-semibold text-ink" id="lesson-plan-heading">
              Mini-lesson plan
            </h2>
          </div>
          <Badge tone="accent">
            <span className="font-mono tabular-nums">{plan.durationMinutes}</span>&nbsp;minutes
          </Badge>
        </div>

        <p className="mt-4 text-sm text-ink">
          <span className="font-medium">Objective: </span>
          {plan.objective}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">Materials: </span>
          {plan.materials.join(", ")}
        </p>

        <ol className="mt-5 space-y-4">
          {plan.steps.map((step, index) => (
            <li className="flex gap-3" key={step.activity}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 font-mono text-xs font-semibold tabular-nums text-ink">
                {index + 1}
              </span>
              <p className="text-sm text-ink">
                <span className="font-mono font-medium tabular-nums text-ink-muted">{step.minutes} min:</span>{" "}
                {step.activity}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-md border border-border bg-surface-2 p-4">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-ink-muted">
            Check for understanding
          </p>
          <p className="mt-1.5 text-sm text-ink">{plan.checkForUnderstanding}</p>
        </div>
      </Card>
    </section>
  );
}
