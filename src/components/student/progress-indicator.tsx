// Slim progress bar used across diagnostic and practice flows. Token-styled, tabular numerals.
export function ProgressIndicator({
  completed,
  total,
  label = "Practice progress",
}: {
  completed: number;
  total: number;
  label?: string;
}) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.min(100, Math.max(0, Math.round((completed / safeTotal) * 100)));

  return (
    <div aria-label={label} className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm text-ink-muted">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-ink-faint">
          {Math.min(completed, total)} of {total}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={Math.min(completed, safeTotal)}
      >
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
