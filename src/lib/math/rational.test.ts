import { describe, expect, it } from "vitest";
import { areEquivalentRationals, normalizeRational, parseRational } from "@/lib/math/rational";

describe("rational normalization", () => {
  it("normalizes fractions, decimals, integers, and whitespace", () => {
    expect(normalizeRational(" 2 / 4 ")).toBe("1/2");
    expect(normalizeRational("0.5")).toBe("1/2");
    expect(normalizeRational("-1.50")).toBe("-3/2");
    expect(normalizeRational("4")).toBe("4");
  });

  it("recognizes equivalent rational forms", () => {
    expect(areEquivalentRationals("1/2", "2/4")).toBe(true);
    expect(areEquivalentRationals("1/2", "0.5")).toBe(true);
    expect(areEquivalentRationals("1/2", "0.4")).toBe(false);
  });

  it("rejects invalid values", () => {
    expect(parseRational("1/0")).toBeNull();
    expect(parseRational("one half")).toBeNull();
    expect(parseRational("1/2/3")).toBeNull();
    expect(parseRational("")).toBeNull();
  });
});
