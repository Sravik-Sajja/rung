import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCurriculumCache, withCurriculumCache } from "@/lib/content/curriculum-cache";

const cacheEnvKeys = ["RUNG_CURRICULUM_CACHE_SECONDS", "RUNG_CURRICULUM_CACHE_MAX_ENTRIES"] as const;

beforeEach(() => {
  clearCurriculumCache();
  for (const key of cacheEnvKeys) delete process.env[key];
});

afterEach(() => {
  vi.useRealTimers();
  for (const key of cacheEnvKeys) delete process.env[key];
});

describe("curriculum cache", () => {
  it("reads through once and serves the cached value afterwards", async () => {
    const load = vi.fn(async () => "diagnostic-fractions-v1");

    const first = await withCurriculumCache("assignment-class:a", load);
    const second = await withCurriculumCache("assignment-class:a", load);

    expect(first).toBe("diagnostic-fractions-v1");
    expect(second).toBe("diagnostic-fractions-v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps separate keys apart", async () => {
    await withCurriculumCache("assignment-items:a", async () => ["a"]);
    const other = await withCurriculumCache("assignment-items:b", async () => ["b"]);

    expect(other).toEqual(["b"]);
  });

  it("issues one query when concurrent requests race a cold key", async () => {
    let resolveLoad: (value: string[]) => void = () => {};
    const load = vi.fn(() => new Promise<string[]>((resolve) => { resolveLoad = resolve; }));

    const inFlight = Promise.all([
      withCurriculumCache("assignment-items:race", load),
      withCurriculumCache("assignment-items:race", load),
      withCurriculumCache("assignment-items:race", load),
    ]);
    resolveLoad(["item-1"]);

    expect(await inFlight).toEqual([["item-1"], ["item-1"], ["item-1"]]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never caches a failed read, so a transient database error is retried", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce("recovered");

    await expect(withCurriculumCache("subskill-prerequisites", load)).rejects.toThrow("connection reset");
    await expect(withCurriculumCache("subskill-prerequisites", load)).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("re-reads once the entry expires, which is how a reseed becomes visible", async () => {
    vi.useFakeTimers();
    process.env.RUNG_CURRICULUM_CACHE_SECONDS = "60";
    const load = vi.fn().mockResolvedValueOnce("before-reseed").mockResolvedValueOnce("after-reseed");

    expect(await withCurriculumCache("assignment-items:seeded", load)).toBe("before-reseed");
    vi.advanceTimersByTime(59_000);
    expect(await withCurriculumCache("assignment-items:seeded", load)).toBe("before-reseed");
    vi.advanceTimersByTime(2_000);
    expect(await withCurriculumCache("assignment-items:seeded", load)).toBe("after-reseed");
  });

  it("bypasses the cache entirely when the TTL is zero", async () => {
    process.env.RUNG_CURRICULUM_CACHE_SECONDS = "0";
    const load = vi.fn(async () => "live");

    await withCurriculumCache("assignment-items:live", load);
    await withCurriculumCache("assignment-items:live", load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("falls back to the default TTL when the configured value is not a number", async () => {
    process.env.RUNG_CURRICULUM_CACHE_SECONDS = "not-a-number";
    const load = vi.fn(async () => "cached");

    await withCurriculumCache("assignment-items:typo", load);
    await withCurriculumCache("assignment-items:typo", load);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("stays bounded when runtime-generated items keep minting new keys", async () => {
    process.env.RUNG_CURRICULUM_CACHE_MAX_ENTRIES = "3";
    const load = vi.fn(async () => "item");

    for (let index = 0; index < 10; index += 1) {
      await withCurriculumCache(`generated-item:${index}`, load);
    }
    // The oldest keys were evicted, so re-reading the first one costs a query.
    await withCurriculumCache("generated-item:0", load);

    expect(load).toHaveBeenCalledTimes(11);
  });
});
