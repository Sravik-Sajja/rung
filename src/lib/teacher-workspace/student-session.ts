// Server-only student join sessions for an isolated teacher workspace. These
// are deliberately independent from the public walkthrough participant cookie.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  addLocalTeacherWorkspaceStudent,
  isTeacherWorkspaceDemoMode,
  resolveLocalTeacherWorkspaceJoinCode,
} from "@/lib/teacher-workspace/session";

export const TEACHER_WORKSPACE_STUDENT_COOKIE = "rung_teacher_workspace_student";
export const TEACHER_WORKSPACE_STUDENT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const STUDENT_ID_PREFIX = "teacher-demo-learner-";
const STUDENT_GRADE_BAND = "6-8";

const joinCodeSchema = z.string().trim().toUpperCase().regex(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){2}$/, "Enter the three four-character groups from your teacher.");

export const teacherWorkspaceJoinSchema = z.object({
  joinCode: joinCodeSchema,
  displayName: z.string().trim().min(1, "Enter a first name or nickname.").max(32, "Use 32 characters or fewer.")
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} 'â€™.-]*$/u, "Use letters, numbers, spaces, apostrophes, periods, or hyphens."),
});

/**
 * An already-signed-in walkthrough learner supplies only a code. Their student
 * and display name come from the server's own resolved participant cookie, so a
 * request body can never name the learner being enrolled.
 */
export const teacherWorkspaceParticipantJoinSchema = z.object({ joinCode: joinCodeSchema });

export type TeacherWorkspaceStudent = {
  studentId: string;
  displayName: string;
  gradeBand: string;
  classId: string;
  assignmentId: string;
  expiresAt: string;
  source: "local" | "supabase";
};
export type CreatedTeacherWorkspaceStudent = TeacherWorkspaceStudent & { sessionToken: string };
export type TeacherWorkspaceStudentSessionResolution =
  | { kind: "missing_cookie" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "resolved"; student: TeacherWorkspaceStudent };

type LocalRecord = TeacherWorkspaceStudent & { tokenHash: string };
declare global { var __rungTeacherWorkspaceStudentState: Map<string, LocalRecord> | undefined; }
const localState = globalThis.__rungTeacherWorkspaceStudentState instanceof Map
  ? globalThis.__rungTeacherWorkspaceStudentState
  : new Map<string, LocalRecord>();
globalThis.__rungTeacherWorkspaceStudentState = localState;

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}
function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function token() { return randomBytes(32).toString("base64url"); }
function validToken(value: string) { return /^[A-Za-z0-9_-]{32,128}$/.test(value); }
function expiry(now = new Date()) { return new Date(now.getTime() + TEACHER_WORKSPACE_STUDENT_SESSION_MAX_AGE_SECONDS * 1_000).toISOString(); }

export function parseTeacherWorkspaceStudentCookie(header: string | null) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== TEACHER_WORKSPACE_STUDENT_COOKIE) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

function localStudent(input: z.infer<typeof teacherWorkspaceJoinSchema>, sessionToken: string, expiresAt: string): CreatedTeacherWorkspaceStudent {
  const workspace = resolveLocalTeacherWorkspaceJoinCode(input.joinCode);
  if (!workspace) throw new Error("That join code is not active. Ask your teacher to check it.");
  const student: TeacherWorkspaceStudent = {
    studentId: `${STUDENT_ID_PREFIX}${randomUUID().replaceAll("-", "")}`,
    displayName: input.displayName,
    gradeBand: STUDENT_GRADE_BAND,
    classId: workspace.classId,
    assignmentId: workspace.assignmentId,
    expiresAt,
    source: "local",
  };
  localState.set(tokenHash(sessionToken), { ...student, tokenHash: tokenHash(sessionToken) });
  addLocalTeacherWorkspaceStudent(student);
  return { ...student, sessionToken };
}

type DurableRow = {
  student_id: string;
  display_name: string;
  grade_band: string;
  class_id: string;
  assignment_id: string;
  expires_at: string;
};
function fromDurable(row: DurableRow, sessionToken?: string): TeacherWorkspaceStudent | CreatedTeacherWorkspaceStudent {
  if (!row.student_id || !row.display_name || !row.class_id || !row.assignment_id || !row.expires_at) throw new Error("The joined student session is incomplete.");
  const student: TeacherWorkspaceStudent = {
    studentId: row.student_id, displayName: row.display_name, gradeBand: row.grade_band || STUDENT_GRADE_BAND,
    classId: row.class_id, assignmentId: row.assignment_id, expiresAt: row.expires_at, source: "supabase",
  };
  return sessionToken ? { ...student, sessionToken } : student;
}

/** Atomically creates the student, enrollment, initial mastery matrix, and opaque session. */
export async function createTeacherWorkspaceStudentSession(input: z.infer<typeof teacherWorkspaceJoinSchema> & { now?: Date }): Promise<CreatedTeacherWorkspaceStudent> {
  if (!isTeacherWorkspaceDemoMode()) throw new Error("Teacher workspace joining is available only when DEMO_MODE=true outside production.");
  const join = teacherWorkspaceJoinSchema.parse(input);
  const sessionToken = token();
  const expiresAt = expiry(input.now);
  const client = configuredClient();
  if (!client) return localStudent(join, sessionToken, expiresAt);
  const { data, error } = await client.rpc("join_teacher_demo_workspace", {
    p_join_code: join.joinCode,
    p_display_name: join.displayName,
    p_token_hash: tokenHash(sessionToken),
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`Could not join the teacher workspace: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as DurableRow | null;
  if (!row) throw new Error("That join code is not active. Ask your teacher to check it.");
  return fromDurable(row, sessionToken) as CreatedTeacherWorkspaceStudent;
}

/**
 * Enrolls an existing walkthrough learner into a workspace without minting a
 * second student. Mastery is class-scoped, so the joined class opens its own
 * matrix and the learner's walkthrough work stays out of the teacher's roster.
 */
export async function joinTeacherWorkspaceAsParticipant(input: {
  joinCode: string;
  participant: { studentId: string; displayName: string; gradeBand: string };
  now?: Date;
}): Promise<CreatedTeacherWorkspaceStudent> {
  if (!isTeacherWorkspaceDemoMode()) throw new Error("Teacher workspace joining is available only when DEMO_MODE=true outside production.");
  const { joinCode } = teacherWorkspaceParticipantJoinSchema.parse({ joinCode: input.joinCode });
  const sessionToken = token();
  const expiresAt = expiry(input.now);
  const client = configuredClient();
  if (!client) {
    const workspace = resolveLocalTeacherWorkspaceJoinCode(joinCode);
    if (!workspace) throw new Error("That join code is not active. Ask your teacher to check it.");
    const student: TeacherWorkspaceStudent = {
      studentId: input.participant.studentId,
      displayName: input.participant.displayName,
      gradeBand: input.participant.gradeBand || STUDENT_GRADE_BAND,
      classId: workspace.classId,
      assignmentId: workspace.assignmentId,
      expiresAt,
      source: "local",
    };
    localState.set(tokenHash(sessionToken), { ...student, tokenHash: tokenHash(sessionToken) });
    addLocalTeacherWorkspaceStudent(student);
    return { ...student, sessionToken };
  }
  const { data, error } = await client.rpc("join_teacher_demo_workspace_as_participant", {
    p_join_code: joinCode,
    p_student_id: input.participant.studentId,
    p_token_hash: tokenHash(sessionToken),
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`Could not join the class: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as DurableRow | null;
  if (!row) throw new Error("That join code is not active. Ask your teacher to check it.");
  return fromDurable(row, sessionToken) as CreatedTeacherWorkspaceStudent;
}

export type TeacherWorkspacePreview = { className: string; teacherDisplayName: string; assignmentTitle: string };

/** Resolves a join code to the class a confirm screen needs to name. */
export async function previewTeacherWorkspaceJoinCode(rawJoinCode: string): Promise<TeacherWorkspacePreview | null> {
  if (!isTeacherWorkspaceDemoMode()) throw new Error("Teacher workspace joining is available only when DEMO_MODE=true outside production.");
  const parsed = teacherWorkspaceParticipantJoinSchema.safeParse({ joinCode: rawJoinCode });
  if (!parsed.success) return null;
  const client = configuredClient();
  if (!client) {
    const workspace = resolveLocalTeacherWorkspaceJoinCode(parsed.data.joinCode);
    return workspace ? { className: workspace.className, teacherDisplayName: workspace.teacherDisplayName, assignmentTitle: "Fractions check-in" } : null;
  }
  const { data, error } = await client.rpc("preview_teacher_demo_workspace", { p_join_code: parsed.data.joinCode });
  if (error) throw new Error(`Could not read that join code: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { class_name?: string; teacher_display_name?: string; assignment_title?: string } | null;
  if (!row?.class_name) return null;
  return {
    className: row.class_name,
    teacherDisplayName: row.teacher_display_name ?? "Your teacher",
    assignmentTitle: row.assignment_title ?? "Check-in",
  };
}

function localResolution(value: string, now: Date): TeacherWorkspaceStudentSessionResolution {
  const record = localState.get(tokenHash(value));
  if (!record) return { kind: "invalid" };
  if (new Date(record.expiresAt).getTime() <= now.getTime()) return { kind: "expired" };
  const { tokenHash: _tokenHash, ...student } = record;
  return { kind: "resolved", student };
}

/**
 * Resolves only a server-issued opaque cookie and verifies the stored class,
 * assignment, and enrollment still agree. No request body or URL can select a
 * class or assignment for a joined student.
 */
export async function resolveTeacherWorkspaceStudentSession(request: Request, now = new Date()): Promise<TeacherWorkspaceStudentSessionResolution> {
  const value = parseTeacherWorkspaceStudentCookie(request.headers.get("cookie"));
  if (!value) return { kind: "missing_cookie" };
  if (!validToken(value)) return { kind: "invalid" };
  const client = configuredClient();
  if (!client) return localResolution(value, now);
  const { data, error } = await client.from("teacher_demo_student_sessions")
    .select("student_id, class_id, assignment_id, expires_at, revoked_at, students(display_name, grade_band), teacher_demo_sessions!inner(expires_at, revoked_at)")
    .eq("token_hash", tokenHash(value)).maybeSingle();
  if (error) throw new Error(`Could not resolve the joined student session: ${error.message}`);
  if (!data || data.revoked_at) return { kind: "invalid" };
  if (new Date(data.expires_at).getTime() <= now.getTime()) return { kind: "expired" };
  const parent = Array.isArray(data.teacher_demo_sessions) ? data.teacher_demo_sessions[0] : data.teacher_demo_sessions;
  // Ending or expiring the workspace ends every child student capability,
  // even if the student's own cookie has time remaining.
  if (!parent || parent.revoked_at || new Date(parent.expires_at).getTime() <= now.getTime()) return { kind: "invalid" };
  const student = Array.isArray(data.students) ? data.students[0] : data.students;
  if (!student?.display_name) return { kind: "invalid" };
  const [{ data: assignment, error: assignmentError }, { data: enrollment, error: enrollmentError }] = await Promise.all([
    client.from("assignments").select("id").eq("id", data.assignment_id).eq("class_id", data.class_id).maybeSingle(),
    client.from("class_enrollments").select("student_id").eq("class_id", data.class_id).eq("student_id", data.student_id).maybeSingle(),
  ]);
  if (assignmentError || enrollmentError) throw new Error(`Could not verify the joined student session: ${assignmentError?.message ?? enrollmentError?.message}`);
  if (!assignment || !enrollment) return { kind: "invalid" };
  return { kind: "resolved", student: fromDurable({
    student_id: data.student_id, display_name: student.display_name, grade_band: student.grade_band,
    class_id: data.class_id, assignment_id: data.assignment_id, expires_at: data.expires_at,
  }) as TeacherWorkspaceStudent };
}

/** Enforces the exact session-bound assignment before an assignment API acts. */
export async function requireTeacherWorkspaceStudentAssignment(request: Request, requestedStudentId: string, requestedAssignmentId: string) {
  const session = await resolveTeacherWorkspaceStudentSession(request);
  if (session.kind !== "resolved") throw new Error("Join a teacher workspace before accessing learner work.");
  if (session.student.studentId !== requestedStudentId || session.student.assignmentId !== requestedAssignmentId) {
    throw new Error("This joined student session cannot access that assignment.");
  }
  return session.student;
}

export async function revokeTeacherWorkspaceStudentSession(request: Request) {
  const value = parseTeacherWorkspaceStudentCookie(request.headers.get("cookie"));
  if (!value || !validToken(value)) return;
  const client = configuredClient();
  if (!client) { localState.delete(tokenHash(value)); return; }
  const { error } = await client.from("teacher_demo_student_sessions").update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash(value)).is("revoked_at", null);
  if (error) throw new Error(`Could not end the joined student session: ${error.message}`);
}

export function resetTeacherWorkspaceStudentSessionStore() { localState.clear(); }
