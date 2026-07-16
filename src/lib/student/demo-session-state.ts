/**
 * Reload-safe state for the demo-only diagnostic and practice fallback.
 *
 * Next.js may evaluate a route module again during development. Module-local
 * Maps are then recreated, leaving a browser with a session ID that no longer
 * exists. Keeping this small container on `globalThis` preserves the same
 * session records and monotonically allocated IDs across those module reloads.
 *
 * This is intentionally not production persistence: it is cleared when the
 * Node process restarts. Supabase remains the source of truth outside demo
 * mode.
 */

export type DemoSessionKind = "diagnostic" | "practice";

interface DemoSessionState {
  nextSequence: number;
  diagnosticRuns: Map<string, unknown>;
  practiceRuns: Map<string, unknown>;
}

declare global {
  // Shared by server module instances in one local Next.js process.
  // eslint-disable-next-line no-var
  var __rungDemoSessionState: DemoSessionState | undefined;
}

function createState(): DemoSessionState {
  return {
    nextSequence: 0,
    diagnosticRuns: new Map(),
    practiceRuns: new Map(),
  };
}

function isDemoSessionState(value: unknown): value is DemoSessionState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoSessionState>;
  return (
    typeof candidate.nextSequence === "number"
    && candidate.diagnosticRuns instanceof Map
    && candidate.practiceRuns instanceof Map
  );
}

const existingState = globalThis.__rungDemoSessionState;
const state = isDemoSessionState(existingState) ? existingState : createState();
globalThis.__rungDemoSessionState = state;

function runsFor(kind: DemoSessionKind) {
  return kind === "diagnostic" ? state.diagnosticRuns : state.practiceRuns;
}

/** Allocates an ID that remains unique while the local server process lives. */
export function createDemoSessionId(kind: DemoSessionKind): string {
  state.nextSequence += 1;
  return `demo-${kind}-${state.nextSequence}`;
}

/** Stores a demo run under an ID returned by `createDemoSessionId`. */
export function setDemoSession<T>(kind: DemoSessionKind, sessionId: string, run: T): T {
  runsFor(kind).set(sessionId, run);
  return run;
}

/** Returns the original run object, so ordinary mutations remain persistent. */
export function getDemoSession<T>(kind: DemoSessionKind, sessionId: string): T | undefined {
  return runsFor(kind).get(sessionId) as T | undefined;
}

export function deleteDemoSession(kind: DemoSessionKind, sessionId: string): boolean {
  return runsFor(kind).delete(sessionId);
}

/** Clears only local demo state. Intended for tests and an explicit demo reset. */
export function resetDemoSessionState() {
  state.nextSequence = 0;
  state.diagnosticRuns.clear();
  state.practiceRuns.clear();
}
