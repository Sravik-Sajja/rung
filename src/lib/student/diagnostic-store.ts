// Session-scoped diagnostic response store. Demo/client-session only — deliberately not backed by
// Supabase or any server persistence. Guarded for SSR: every read/write is a safe no-op when
// `window`/`sessionStorage` is unavailable (server render, storage disabled, private-mode limits).
export interface DiagnosticResponse {
  itemId: string;
  answerRaw: string;
  isCorrect: boolean;
  misconceptionTag: string | null;
}

const STORAGE_KEY = "rung.diagnostic.responses.v1";

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Reads every response recorded so far in this browser session, oldest first. */
export function readDiagnosticResponses(): DiagnosticResponse[] {
  const store = sessionStore();
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagnosticResponse[]) : [];
  } catch {
    return [];
  }
}

/**
 * Appends one item's response, replacing any prior response for the same item (so revisiting an
 * item during the same run never double-counts). Returns the resulting full list.
 */
export function appendDiagnosticResponse(response: DiagnosticResponse): DiagnosticResponse[] {
  const next = [...readDiagnosticResponses().filter((existing) => existing.itemId !== response.itemId), response];
  const store = sessionStore();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be full or disabled; the caller's in-memory stepper state still advances.
    }
  }
  return next;
}

/** Clears all recorded responses — called when a fresh diagnostic run starts. */
export function clearDiagnosticResponses(): void {
  const store = sessionStore();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
