/**
 * A short-lived, process-local cache for seeded curriculum reads.
 *
 * Items, subskills, assignments, and assignment_items change only when
 * `npm run seed` runs, but they are read on every answer submission and every
 * hint request. That was free when the demo store was a process-local array; now
 * that the same reads cross the network to Postgres, re-reading immutable rows is
 * the single largest source of per-request latency in the student loop.
 *
 * Scope is deliberately narrow. Only data that a running server never mutates
 * belongs here — never mastery, responses, sessions, or support state, whose
 * freshness the teacher heatmap depends on.
 *
 * Two properties matter beyond the obvious hit/miss:
 *
 * - The cached value is the in-flight promise, not the resolved value, so a
 *   cold start that takes ten concurrent requests issues one query rather than
 *   ten. A rejected load is evicted, so a transient database failure is never
 *   cached as an outcome.
 * - Entries expire. `npm run seed` runs out of process and cannot invalidate a
 *   cache inside a running server, so a TTL is what makes a reseed visible
 *   without a restart. RUNG_CURRICULUM_CACHE_SECONDS=0 disables caching outright,
 *   which is the escape hatch if seeded content is being edited live.
 */

/** One hour: long enough that the demo loop never re-reads the item bank, short enough that a reseed surfaces within a rehearsal. */
const DEFAULT_CACHE_SECONDS = 3_600;

/**
 * Keys are bounded by curriculum size for seeded content, but runtime-generated
 * practice items mint a new item id per learner, so the map needs a ceiling to
 * stay bounded across a long-running server.
 */
const DEFAULT_MAX_ENTRIES = 500;

type CacheEntry = { expiresAt: number; value: Promise<unknown> };

const entries = new Map<string, CacheEntry>();

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw?.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cacheTtlMs(): number {
  return readPositiveInt(process.env.RUNG_CURRICULUM_CACHE_SECONDS, DEFAULT_CACHE_SECONDS) * 1_000;
}

function maxEntries(): number {
  return readPositiveInt(process.env.RUNG_CURRICULUM_CACHE_MAX_ENTRIES, DEFAULT_MAX_ENTRIES);
}

/** Drops expired entries first, then the oldest inserted, which Map iteration yields in order. */
function evictTo(limit: number, now: number): void {
  for (const [key, entry] of entries) {
    if (entries.size <= limit) return;
    if (entry.expiresAt <= now) entries.delete(key);
  }
  for (const key of entries.keys()) {
    if (entries.size <= limit) return;
    entries.delete(key);
  }
}

/**
 * Returns the cached value for `key`, loading it once if it is absent or stale.
 * `load` must read only data that a running server never mutates.
 */
export async function withCurriculumCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  const ttl = cacheTtlMs();
  if (ttl === 0) return load();

  const now = Date.now();
  const cached = entries.get(key);
  if (cached && cached.expiresAt > now) return cached.value as Promise<T>;

  const value = load().catch((error: unknown) => {
    // Never let a transient failure occupy the slot until its TTL expires.
    entries.delete(key);
    throw error;
  });
  entries.set(key, { expiresAt: now + ttl, value });

  const limit = maxEntries();
  if (limit > 0 && entries.size > limit) evictTo(limit, now);

  return value as Promise<T>;
}

/**
 * Test hook. `npm run seed` cannot call this — it is a separate process and
 * never shares memory with a running server — which is exactly why the TTL
 * above, and not an explicit invalidation, is what makes a reseed visible.
 */
export function clearCurriculumCache(): void {
  entries.clear();
}
