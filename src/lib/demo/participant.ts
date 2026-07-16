// Server-only temporary learner identity for the non-production walkthrough.
//
// A browser receives only an opaque, httpOnly session token. The corresponding
// student ID is created by the server and is checked against that token on every
// student route; a client-supplied studentId is therefore only a consistency
// assertion, never authority to impersonate another learner.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { canonicalDemoIds } from "@/lib/demo/contracts";

export const DEMO_PARTICIPANT_COOKIE = "rung_demo_participant";
export const DEMO_PARTICIPANT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const DEMO_PARTICIPANT_GRADE_BAND = "6-8";
const DEMO_PARTICIPANT_ID_PREFIX = "demo-learner-";

/**
 * This deliberately permits a short nickname, but not arbitrary markup or a
 * full personal profile. The display name is rendered as text by the client.
 */
export const demoParticipantNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a first name or nickname.")
  .max(32, "Use 32 characters or fewer.")
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} '’.-]*$/u, "Use letters, numbers, spaces, apostrophes, periods, or hyphens.");

export type DemoParticipant = {
  studentId: string;
  displayName: string;
  gradeBand: string;
  classId: string;
  expiresAt: string;
  source: "local" | "supabase";
};

export type CreatedDemoParticipant = DemoParticipant & {
  /** Set once in an httpOnly cookie by the route. Never expose this in JSON. */
  sessionToken: string;
};

export type DemoParticipantSessionResolution =
  | { kind: "missing_cookie" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "resolved"; participant: DemoParticipant };

type LocalParticipantRecord = DemoParticipant & {
  tokenHash: string;
};

type LocalParticipantState = {
  byTokenHash: Map<string, LocalParticipantRecord>;
  byStudentId: Map<string, LocalParticipantRecord>;
};

declare global {
  // Deliberately process-local: the local store is only the no-Supabase demo
  // fallback. Durable deployments use demo_participant_sessions instead.
  // eslint-disable-next-line no-var
  var __rungDemoParticipantState: LocalParticipantState | undefined;
}

function createLocalState(): LocalParticipantState {
  return { byTokenHash: new Map(), byStudentId: new Map() };
}

function isLocalState(value: unknown): value is LocalParticipantState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalParticipantState>;
  return candidate.byTokenHash instanceof Map && candidate.byStudentId instanceof Map;
}

const priorState = globalThis.__rungDemoParticipantState;
const localState = isLocalState(priorState) ? priorState : createLocalState();
globalThis.__rungDemoParticipantState = localState;

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null;
}

export function isDemoMode(): boolean {
  // DEMO_MODE is intentionally never an escape hatch in a production deploy.
  // A misconfigured environment must fail closed rather than expose anonymous
  // temporary-learner creation alongside real student data.
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEMO_MODE === "true"
    || (process.env.NODE_ENV === "development" && process.env.DEMO_MODE !== "false");
}

export function parseDemoParticipantCookie(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== DEMO_PARTICIPANT_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isOpaqueSessionToken(value: string): boolean {
  // base64url tokens issued below are 43 characters. Keep a small generous
  // bound so malformed/untrusted cookies are rejected before hashing/querying.
  return /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function expiresAt(now = new Date()): string {
  return new Date(now.getTime() + DEMO_PARTICIPANT_SESSION_MAX_AGE_SECONDS * 1_000).toISOString();
}

function normalizedName(displayName: string): string {
  return demoParticipantNameSchema.parse(displayName);
}

function asDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("The demo session has an invalid expiry.");
  return parsed;
}

function createLocalParticipant(displayName: string, token: string, expiry: string): CreatedDemoParticipant {
  const participant: DemoParticipant = {
    studentId: `${DEMO_PARTICIPANT_ID_PREFIX}${randomUUID().replaceAll("-", "")}`,
    displayName,
    gradeBand: DEMO_PARTICIPANT_GRADE_BAND,
    classId: canonicalDemoIds.classId,
    expiresAt: expiry,
    source: "local",
  };
  const record: LocalParticipantRecord = { ...participant, tokenHash: tokenHash(token) };
  localState.byTokenHash.set(record.tokenHash, record);
  localState.byStudentId.set(record.studentId, record);
  return { ...participant, sessionToken: token };
}

type DurableParticipantRow = {
  student_id: string;
  display_name: string;
  grade_band: string;
  class_id: string;
  expires_at: string;
};

function toDurableParticipant(row: DurableParticipantRow, sessionToken: string): CreatedDemoParticipant {
  if (!row.student_id || !row.display_name || !row.class_id || !row.expires_at) {
    throw new Error("The demo participant record is incomplete.");
  }
  return {
    studentId: row.student_id,
    displayName: row.display_name,
    gradeBand: row.grade_band || DEMO_PARTICIPANT_GRADE_BAND,
    classId: row.class_id,
    expiresAt: row.expires_at,
    source: "supabase",
    sessionToken,
  };
}

/**
 * Creates a fresh temporary learner. With Supabase configured, a service-role
 * RPC atomically creates the student, enrollment, mastery rows, and a hashed
 * demo session. Without Supabase, an equivalent process-local record powers
 * the walkthrough only for the lifetime of the local server.
 */
export async function createDemoParticipant(input: { displayName: string; now?: Date }): Promise<CreatedDemoParticipant> {
  if (!isDemoMode()) throw new Error("Temporary demo learners are available only in demo mode.");
  const displayName = normalizedName(input.displayName);
  const sessionToken = newToken();
  const expiry = expiresAt(input.now);
  const client = configuredClient();
  if (!client) return createLocalParticipant(displayName, sessionToken, expiry);

  const { data, error } = await client.rpc("create_demo_participant", {
    p_display_name: displayName,
    p_token_hash: tokenHash(sessionToken),
    p_expires_at: expiry,
  });
  if (error) throw new Error(`Could not create the temporary learner: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as DurableParticipantRow | null;
  if (!row) throw new Error("Could not create the temporary learner.");
  return toDurableParticipant(row, sessionToken);
}

function localResolution(token: string, now: Date): DemoParticipantSessionResolution {
  const record = localState.byTokenHash.get(tokenHash(token));
  if (!record) return { kind: "invalid" };
  if (asDate(record.expiresAt).getTime() <= now.getTime()) return { kind: "expired" };
  const { tokenHash: _tokenHash, ...participant } = record;
  return { kind: "resolved", participant };
}

type DurableSessionRow = {
  student_id: string;
  class_id: string;
  expires_at: string;
  revoked_at: string | null;
  students: { display_name: string; grade_band: string } | Array<{ display_name: string; grade_band: string }> | null;
};

async function durableResolution(token: string, now: Date): Promise<DemoParticipantSessionResolution> {
  const client = configuredClient();
  if (!client) return localResolution(token, now);
  const { data, error } = await client
    .from("demo_participant_sessions")
    .select("student_id, class_id, expires_at, revoked_at, students(display_name, grade_band)")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (error) throw new Error(`Could not resolve the demo session: ${error.message}`);
  const row = data as DurableSessionRow | null;
  if (!row || row.revoked_at) return { kind: "invalid" };
  if (asDate(row.expires_at).getTime() <= now.getTime()) return { kind: "expired" };
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  if (!student?.display_name || !row.student_id || !row.class_id) return { kind: "invalid" };
  return {
    kind: "resolved",
    participant: {
      studentId: row.student_id,
      displayName: student.display_name,
      gradeBand: student.grade_band || DEMO_PARTICIPANT_GRADE_BAND,
      classId: row.class_id,
      expiresAt: row.expires_at,
      source: "supabase",
    },
  };
}

/** Resolves only the opaque cookie; it never reads a student ID from a client body or query. */
export async function resolveDemoParticipantSession(request: Request, now = new Date()): Promise<DemoParticipantSessionResolution> {
  const token = parseDemoParticipantCookie(request.headers.get("cookie"));
  if (!token) return { kind: "missing_cookie" };
  if (!isOpaqueSessionToken(token)) return { kind: "invalid" };
  return durableResolution(token, now);
}

/**
 * Local-only teacher-repository hook. Durable participants are already read
 * through class_mastery_heatmap after the migration's student/enrollment/
 * mastery inserts. Keep expired local participants visible for the remainder
 * of a process so a teacher can finish the walkthrough they just observed.
 */
export function getLocalDemoParticipants(): DemoParticipant[] {
  return [...localState.byStudentId.values()].map(({ tokenHash: _tokenHash, ...participant }) => participant);
}

/** Test-only reset for the process-local no-Supabase fallback. */
export function resetDemoParticipantStore() {
  localState.byTokenHash.clear();
  localState.byStudentId.clear();
}
