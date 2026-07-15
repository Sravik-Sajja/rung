// Streak counter with a spark bolt — momentum cue for the energetic student surface. Renders nothing at zero.
export function StreakChip({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    // Keyed on count so every new streak step remounts the chip and replays the pop — the chip
    // should feel like it's *reacting* to momentum, not just relabeling a static pill.
    <span
      key={count}
      className="inline-flex animate-pop items-center gap-1 rounded-full bg-spark-soft px-2.5 py-1 text-sm font-semibold text-spark-ink shadow-sm"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
      </svg>
      <span className="tabular-nums">{count}</span>
      <span className="sr-only">answers in a row</span>
    </span>
  );
}
