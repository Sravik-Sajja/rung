import type { ItemVisualSpec } from "@/lib/types";

/** A read-only number line for assessment items. It deliberately has no drag,
 * click, or answer affordance: the marked point is the question's evidence,
 * while the answer remains in the student's input below. */
export function NumberLineQuestion({ visualSpec }: { visualSpec: Extract<ItemVisualSpec, { kind: "number_line" }> }) {
  const { denominator, markedNumerator, pointLabel } = visualSpec;
  const start = 44;
  const end = 556;
  const y = 52;
  const width = end - start;
  const markX = start + (markedNumerator / denominator) * width;
  const description = `A number line from zero to one is split into ${denominator} equal parts. Point ${pointLabel} is marked ${markedNumerator} parts from zero.`;

  return (
    <figure className="w-full max-w-xl" aria-label={description}>
      <svg viewBox="0 0 600 112" role="img" aria-labelledby="number-line-title number-line-description" className="w-full" preserveAspectRatio="xMidYMid meet">
        <title id="number-line-title">Number line from 0 to 1</title>
        <desc id="number-line-description">{description}</desc>
        <line x1={start} y1={y} x2={end} y2={y} className="stroke-border-strong" strokeWidth="3" />
        {Array.from({ length: denominator + 1 }, (_, index) => {
          const x = start + (index / denominator) * width;
          return <line key={index} x1={x} y1={y - 11} x2={x} y2={y + 11} className="stroke-border-strong" strokeWidth="2" />;
        })}
        <text x={start} y={y + 34} textAnchor="middle" className="fill-ink-muted text-sm font-semibold">0</text>
        <text x={end} y={y + 34} textAnchor="middle" className="fill-ink-muted text-sm font-semibold">1</text>
        <line x1={markX} y1={y - 28} x2={markX} y2={y - 8} className="stroke-focus" strokeWidth="2" />
        <circle cx={markX} cy={y} r="9" className="fill-focus" />
        <text x={markX} y={y - 35} textAnchor="middle" className="fill-focus text-base font-bold">{pointLabel}</text>
      </svg>
      <figcaption className="sr-only">{description}</figcaption>
    </figure>
  );
}
