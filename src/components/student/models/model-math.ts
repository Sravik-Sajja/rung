// Pure math helpers for interactive fraction models. No DOM access here so
// the interaction logic stays testable under vitest's node environment.

export const MIN_PARTS = 2;
export const MAX_PARTS = 12;

// Maps a pointer's client x-coordinate onto the nearest tick along a line
// segment. Clamped so drags that overshoot the line still resolve to a
// valid tick instead of an out-of-range index.
export function snapToTick(
  clientX: number,
  lineLeft: number,
  lineWidth: number,
  parts: number,
): number {
  if (lineWidth <= 0) return 0;
  const fraction = (clientX - lineLeft) / lineWidth;
  const tick = Math.round(fraction * parts);
  return Math.min(Math.max(tick, 0), parts);
}

// When the student changes the number of subdivisions, the shaded amount
// should track the same physical position on the bar rather than staying
// at the same tick count, so we rescale proportionally.
export function remapCount(count: number, oldParts: number, newParts: number): number {
  if (oldParts <= 0) return 0;
  const remapped = Math.round((count / oldParts) * newParts);
  return Math.min(Math.max(remapped, 0), newParts);
}

export function formatFraction(count: number, parts: number): string {
  return `${count}/${parts}`;
}

export type BarState = { parts: number; shaded: number };

// Combines two bar models for the add/subtract fraction task. Only
// defined when both bars share a denominator (matching the pedagogy of
// like-denominator addition/subtraction); a negative subtraction result
// has no physical representation on the bars, so it is also rejected.
export function combineBars(
  op: "add" | "subtract",
  a: BarState,
  b: BarState,
): { numerator: number; denominator: number } | null {
  if (a.parts !== b.parts) return null;
  const denominator = a.parts;
  const numerator = op === "add" ? a.shaded + b.shaded : a.shaded - b.shaded;
  if (numerator < 0) return null;
  return { numerator, denominator };
}
