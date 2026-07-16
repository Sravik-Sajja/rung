import { describe, it, expect } from "vitest";
import {
  MIN_PARTS,
  MAX_PARTS,
  snapToTick,
  remapCount,
  formatFraction,
  combineBars,
} from "./model-math";

describe("snapToTick", () => {
  const lineLeft = 0;
  const lineWidth = 600;

  it("resolves an exact tick center to that tick", () => {
    // parts=4 → ticks at 0,150,300,450,600
    expect(snapToTick(150, lineLeft, lineWidth, 4)).toBe(1);
    expect(snapToTick(300, lineLeft, lineWidth, 4)).toBe(2);
    expect(snapToTick(450, lineLeft, lineWidth, 4)).toBe(3);
  });

  it("rounds a midpoint between two ticks to the nearer one", () => {
    // parts=4, ticks at 0 and 150; midpoint 75 → fraction*parts = 0.5 rounds to 1
    expect(snapToTick(75, lineLeft, lineWidth, 4)).toBe(1);
    // fraction*parts = 1.5 rounds to 2 (banker's-away-from-zero via Math.round)
    expect(snapToTick(225, lineLeft, lineWidth, 4)).toBe(2);
  });

  it("clamps to 0 when the pointer is left of the line", () => {
    expect(snapToTick(-100, lineLeft, lineWidth, 4)).toBe(0);
  });

  it("clamps to parts when the pointer is right of the line", () => {
    expect(snapToTick(900, lineLeft, lineWidth, 4)).toBe(4);
  });

  it("handles the MIN_PARTS bound", () => {
    expect(snapToTick(0, lineLeft, lineWidth, MIN_PARTS)).toBe(0);
    expect(snapToTick(300, lineLeft, lineWidth, MIN_PARTS)).toBe(1);
    expect(snapToTick(600, lineLeft, lineWidth, MIN_PARTS)).toBe(2);
    expect(snapToTick(-50, lineLeft, lineWidth, MIN_PARTS)).toBe(0);
    expect(snapToTick(650, lineLeft, lineWidth, MIN_PARTS)).toBe(MIN_PARTS);
  });

  it("handles the MAX_PARTS bound", () => {
    expect(snapToTick(0, lineLeft, lineWidth, MAX_PARTS)).toBe(0);
    expect(snapToTick(600, lineLeft, lineWidth, MAX_PARTS)).toBe(MAX_PARTS);
    expect(snapToTick(50, lineLeft, lineWidth, MAX_PARTS)).toBe(1);
    expect(snapToTick(700, lineLeft, lineWidth, MAX_PARTS)).toBe(MAX_PARTS);
  });

  it("returns 0 when the line has no width", () => {
    expect(snapToTick(300, lineLeft, 0, 4)).toBe(0);
    expect(snapToTick(300, lineLeft, -10, 4)).toBe(0);
  });
});

describe("remapCount", () => {
  it("preserves physical position when subdivisions change", () => {
    // 2/4 covers the same span as 3/6
    expect(remapCount(2, 4, 6)).toBe(3);
  });

  it("rounds fractional remaps to the nearest whole tick", () => {
    // 1/3 -> *4 parts = 1.333 rounds to 1
    expect(remapCount(1, 3, 4)).toBe(1);
    // 2/3 -> *4 parts = 2.667 rounds to 3
    expect(remapCount(2, 3, 4)).toBe(3);
  });

  it("clamps the remapped count to newParts", () => {
    expect(remapCount(12, 12, 4)).toBe(4);
  });

  it("keeps 0 at 0 regardless of the new part count", () => {
    expect(remapCount(0, 4, 12)).toBe(0);
    expect(remapCount(0, 12, 2)).toBe(0);
  });

  it("returns 0 when oldParts is non-positive", () => {
    expect(remapCount(3, 0, 6)).toBe(0);
    expect(remapCount(3, -1, 6)).toBe(0);
  });
});

describe("formatFraction", () => {
  it("formats as count/parts", () => {
    expect(formatFraction(3, 4)).toBe("3/4");
    expect(formatFraction(0, MIN_PARTS)).toBe(`0/${MIN_PARTS}`);
    expect(formatFraction(MAX_PARTS, MAX_PARTS)).toBe(`${MAX_PARTS}/${MAX_PARTS}`);
  });
});

describe("combineBars", () => {
  it("adds two bars with equal parts", () => {
    expect(combineBars("add", { parts: 4, shaded: 1 }, { parts: 4, shaded: 2 })).toEqual({
      numerator: 3,
      denominator: 4,
    });
  });

  it("subtracts two bars with equal parts", () => {
    expect(combineBars("subtract", { parts: 5, shaded: 4 }, { parts: 5, shaded: 1 })).toEqual({
      numerator: 3,
      denominator: 5,
    });
  });

  it("returns null when denominators differ", () => {
    expect(combineBars("add", { parts: 4, shaded: 1 }, { parts: 6, shaded: 1 })).toBeNull();
  });

  it("returns null when subtraction would go negative", () => {
    expect(combineBars("subtract", { parts: 4, shaded: 1 }, { parts: 4, shaded: 3 })).toBeNull();
  });

  it("passes through improper results without simplifying", () => {
    expect(combineBars("add", { parts: 4, shaded: 3 }, { parts: 4, shaded: 3 })).toEqual({
      numerator: 6,
      denominator: 4,
    });
  });
});
