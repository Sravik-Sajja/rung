// A thin vertical stub that carries the page's narrative spine through the gap between two
// landing sections, so a section handoff reads as continuation instead of a hard stop / dead
// void. Purely decorative — aria-hidden, no semantics, no interactivity. Server component.
export function SectionConnector({
  from = "transparent",
  to = "var(--border)"
}: {
  /** Gradient start color (top of the stub). CSS color or var(). */
  from?: string;
  /** Gradient end color (bottom of the stub). CSS color or var(). */
  to?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="mx-auto h-12 w-0.5 sm:h-16"
      style={{ background: `linear-gradient(to bottom, ${from}, ${to})` }}
    />
  );
}
