// The climb made visible: filled rungs show momentum through a session. Semantic, not decorative.
import { cn } from "@/components/ui";

export function RungProgress({
  current,
  total,
  label = "Rung"
}: {
  current: number;
  total: number;
  label?: string;
}) {
  const rungs = Array.from({ length: total }, (_, index) => index + 1);

  return (
    <div aria-label={`${label} ${current} of ${total}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
          {label} {current} <span className="text-ink-faint">of {total}</span>
        </span>
      </div>
      <div className="flex gap-1.5" role="presentation">
        {rungs.map((rung) => (
          <span
            key={rung}
            className={cn(
              "h-2.5 flex-1 rounded-full transition-colors",
              rung < current && "bg-accent",
              // The current rung is the one moment of momentum on this bar — spark + shadow lifts
              // it visibly off the flat track instead of just recoloring it. But once current has
              // reached (or passed) the last rung — all rungs complete, e.g. masteredCount === total —
              // there is no "current" rung left to highlight partway through; the climb is done, so
              // that final rung reads as completed/green instead of gold.
              rung === current && current < total && "bg-spark shadow-sm",
              rung === current && current >= total && "bg-accent",
              rung > current && "bg-surface-2"
            )}
          />
        ))}
      </div>
    </div>
  );
}
