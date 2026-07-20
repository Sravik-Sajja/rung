// Server-only, non-production teacher workspace. This is intentionally not
// Supabase Auth: an opaque cookie merely resumes a temporary demo workspace.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { MasteryLevel } from "@/lib/types";

export const TEACHER_WORKSPACE_COOKIE = "rung_teacher_workspace";
export const TEACHER_WORKSPACE_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export const teacherWorkspaceSetupSchema = z.object({
  teacherDisplayName: z.string().trim().min(1, "Enter your display name.").max(48, "Use 48 characters or fewer.")
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} '’.-]*$/u, "Use letters, numbers, spaces, apostrophes, periods, or hyphens."),
  className: z.string().trim().min(1, "Enter a class name.").max(80, "Use 80 characters or fewer.")
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} &'’.,()-]*$/u, "Use letters, numbers, spaces, or basic punctuation."),
});

export type TeacherWorkspaceCell = { studentId: string; subskillId: string; level: MasteryLevel; evidenceSummary: string };
export type TeacherWorkspace = {
  classId: string;
  assignmentId: string;
  className: string;
  teacherDisplayName: string;
  /** Available only after the owner cookie has resolved this workspace. */
  joinCode: string;
  students: Array<{ id: string; displayName: string; gradeBand: string }>;
  subskills: Array<{ id: string; name: string }>;
  cells: TeacherWorkspaceCell[];
  source: "local" | "supabase";
};
export type CreatedTeacherWorkspace = TeacherWorkspace & { sessionToken: string; expiresAt: string };
export type TeacherWorkspaceResolution =
  | { kind: "missing_cookie" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "resolved"; workspace: TeacherWorkspace };

type LocalRecord = CreatedTeacherWorkspace & { tokenHash: string };
declare global { var __rungTeacherWorkspaceState: Map<string, LocalRecord> | undefined; }
const localState = globalThis.__rungTeacherWorkspaceState instanceof Map
  ? globalThis.__rungTeacherWorkspaceState
  : new Map<string, LocalRecord>();
globalThis.__rungTeacherWorkspaceState = localState;

const SKILLS = [
  { id: "workspace-fraction-models", name: "Represent fractions with models" },
  { id: "workspace-equivalent-fractions", name: "Recognize equivalent fractions" },
  { id: "workspace-compare-fractions", name: "Compare fractions" },
  { id: "workspace-add-fractions", name: "Add fractions with unlike denominators" },
];

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/**
 * A public hackathon deployment must opt in separately from DEMO_MODE. This
 * remains a fictional, temporary workspace flow—not production classroom auth.
 */
export function isTeacherWorkspaceDemoMode() {
  if (process.env.NODE_ENV === "production") {
    return process.env.DEMO_MODE === "true" && process.env.ALLOW_DEMO_IN_PROD === "true";
  }
  return process.env.DEMO_MODE === "true";
}

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function token() { return randomBytes(32).toString("base64url"); }
function validToken(value: string) { return /^[A-Za-z0-9_-]{32,128}$/.test(value); }
function expiry(now = new Date()) { return new Date(now.getTime() + TEACHER_WORKSPACE_SESSION_MAX_AGE_SECONDS * 1_000).toISOString(); }

export function parseTeacherWorkspaceCookie(header: string | null) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== TEACHER_WORKSPACE_COOKIE) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}

// Six bytes become exactly twelve hex characters: ABCD-EF01-2345.
// Keep this aligned with the database and client validation contract.
function joinCode() { return randomBytes(6).toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-"); }

/**
 * A workspace starts with no students. Fictional starter evidence used to fill
 * the heatmap, but real joiners then shared a table with invented work, so the
 * roster is now only ever what actually joined.
 */
function localWorkspace(input: z.infer<typeof teacherWorkspaceSetupSchema>, sessionToken: string, expiresAt: string): CreatedTeacherWorkspace {
  const classId = `teacher-demo-class-${randomUUID().replaceAll("-", "")}`;
  const assignmentId = `teacher-demo-diagnostic-${randomUUID().replaceAll("-", "")}`;
  return { classId, assignmentId, className: input.className, teacherDisplayName: input.teacherDisplayName, joinCode: joinCode(), students: [], subskills: SKILLS, cells: [], source: "local", sessionToken, expiresAt };
}

type DurableCreated = { class_id: string; assignment_id: string; class_name: string; teacher_display_name: string; expires_at: string };

/** Creates a class owned by an isolated demo teacher, its diagnostic, and session atomically. The roster starts empty. */
export async function createTeacherWorkspace(input: z.infer<typeof teacherWorkspaceSetupSchema> & { now?: Date }): Promise<CreatedTeacherWorkspace> {
  if (!isTeacherWorkspaceDemoMode()) throw new Error("Teacher workspaces are available only when DEMO_MODE=true outside production.");
  const setup = teacherWorkspaceSetupSchema.parse(input);
  const sessionToken = token();
  const workspaceJoinCode = joinCode();
  const expiresAt = expiry(input.now);
  const client = configuredClient();
  if (!client) {
    const workspace = localWorkspace(setup, sessionToken, expiresAt);
    localState.set(tokenHash(sessionToken), { ...workspace, tokenHash: tokenHash(sessionToken) });
    return workspace;
  }
  const { data, error } = await client.rpc("create_teacher_demo_workspace", {
    p_teacher_display_name: setup.teacherDisplayName,
    p_class_name: setup.className,
    p_token_hash: tokenHash(sessionToken),
    p_join_code: workspaceJoinCode,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`Could not create the teacher workspace: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as DurableCreated | null;
  if (!row?.class_id || !row.assignment_id || !row.class_name || !row.teacher_display_name || !row.expires_at) throw new Error("Could not create the teacher workspace.");
  const workspace = await loadDurableWorkspace(row.class_id, row.assignment_id, workspaceJoinCode);
  return { ...workspace, sessionToken, expiresAt: row.expires_at };
}

async function loadDurableWorkspace(classId: string, assignmentId: string, workspaceJoinCode: string): Promise<TeacherWorkspace> {
  const client = configuredClient();
  if (!client) throw new Error("A configured database is required for durable workspace data.");
  const [{ data: klass, error: classError }, { data: students, error: studentsError }, { data: rows, error: masteryError }, { data: assignment, error: assignmentError }] = await Promise.all([
    client.from("classes").select("id, name, teachers!inner(display_name)").eq("id", classId).maybeSingle(),
    client.from("class_enrollments").select("students!inner(id, display_name, grade_band)").eq("class_id", classId),
    // The heatmap is a view, so it has no PostgREST relationship to
    // subskills. Fetch the small name lookup below instead.
    client.from("class_mastery_heatmap").select("student_id, subskill_id, level, evidence_summary").eq("class_id", classId),
    client.from("assignments").select("topic_id").eq("id", assignmentId).maybeSingle(),
  ]);
  if (classError || studentsError || masteryError || assignmentError) throw new Error(`Could not load the teacher workspace: ${classError?.message ?? studentsError?.message ?? masteryError?.message ?? assignmentError?.message}`);
  if (!klass) throw new Error("The teacher workspace no longer exists.");
  const teacher = Array.isArray(klass.teachers) ? klass.teachers[0] : klass.teachers;
  const roster = (students ?? []).flatMap((row: any) => {
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    return student ? [{ id: student.id, displayName: student.display_name, gradeBand: student.grade_band }] : [];
  });
  // Columns come from the assignment's topic, not from stored mastery: a
  // workspace with nobody in it yet still needs a heatmap to show.
  const topicId = (assignment as { topic_id?: string } | null)?.topic_id;
  const { data: skills, error: skillsError } = topicId
    ? await client.from("subskills").select("id, name").eq("topic_id", topicId).order("id")
    : { data: [], error: null };
  if (skillsError) throw new Error(`Could not load teacher workspace subskills: ${skillsError.message}`);
  const subskillById = new Map((skills ?? []).map((skill: { id: string; name: string }) => [skill.id, skill]));
  const cells = (rows ?? []).flatMap((row: { student_id: string; subskill_id: string; level: string; evidence_summary: string | null }) => {
    if (!subskillById.has(row.subskill_id) || !roster.some((student) => student.id === row.student_id)) return [];
    return [{ studentId: row.student_id, subskillId: row.subskill_id, level: row.level as MasteryLevel, evidenceSummary: row.evidence_summary ?? "No recorded evidence yet." }];
  });
  return { classId, assignmentId, className: klass.name, teacherDisplayName: teacher?.display_name ?? "Teacher", joinCode: workspaceJoinCode, students: roster, subskills: [...subskillById.values()], cells, source: "supabase" };
}

export async function resolveTeacherWorkspaceSession(request: Request, now = new Date()): Promise<TeacherWorkspaceResolution> {
  const sessionToken = parseTeacherWorkspaceCookie(request.headers.get("cookie"));
  if (!sessionToken) return { kind: "missing_cookie" };
  if (!validToken(sessionToken)) return { kind: "invalid" };
  const client = configuredClient();
  if (!client) {
    const record = localState.get(tokenHash(sessionToken));
    if (!record) return { kind: "invalid" };
    if (new Date(record.expiresAt).getTime() <= now.getTime()) return { kind: "expired" };
    const { sessionToken: _sessionToken, expiresAt: _expiresAt, tokenHash: _tokenHash, ...workspace } = record;
    return { kind: "resolved", workspace };
  }
  const { data, error } = await client.from("teacher_demo_sessions").select("class_id, assignment_id, join_code, expires_at, revoked_at").eq("token_hash", tokenHash(sessionToken)).maybeSingle();
  if (error) throw new Error(`Could not resolve the teacher workspace: ${error.message}`);
  if (!data || data.revoked_at) return { kind: "invalid" };
  if (new Date(data.expires_at).getTime() <= now.getTime()) return { kind: "expired" };
  if (!data.assignment_id || !data.join_code) return { kind: "invalid" };
  return { kind: "resolved", workspace: await loadDurableWorkspace(data.class_id, data.assignment_id, data.join_code) };
}

/**
 * Removes one student from a workspace the caller owns. The class is taken from
 * the resolved owner session, never from a request body, so a workspace owner
 * can only ever remove someone from their own class.
 */
export async function removeTeacherWorkspaceStudent(input: { classId: string; studentId: string }) {
  if (!isTeacherWorkspaceDemoMode()) throw new Error("Teacher workspaces are available only when DEMO_MODE=true outside production.");
  const client = configuredClient();
  if (!client) {
    for (const record of localState.values()) {
      if (record.classId !== input.classId) continue;
      record.students = record.students.filter((student) => student.id !== input.studentId);
      record.cells = record.cells.filter((cell) => cell.studentId !== input.studentId);
    }
    return;
  }
  const { error } = await client.rpc("remove_teacher_demo_workspace_student", {
    p_class_id: input.classId,
    p_student_id: input.studentId,
  });
  if (error) throw new Error(`Could not remove that student: ${error.message}`);
}

/** Local fallback lookup used only by the separate student-session helper. */
export function resolveLocalTeacherWorkspaceJoinCode(value: string) {
  for (const record of localState.values()) {
    if (record.joinCode === value && new Date(record.expiresAt).getTime() > Date.now()) return record;
  }
  return null;
}

/** Keeps the no-Supabase teacher heatmap equivalent to the durable join RPC. */
export function addLocalTeacherWorkspaceStudent(input: { classId: string; studentId: string; displayName: string; gradeBand: string }) {
  for (const record of localState.values()) {
    if (record.classId !== input.classId) continue;
    record.students.push({ id: input.studentId, displayName: input.displayName, gradeBand: input.gradeBand });
    record.cells.push(...record.subskills.map((subskill) => ({
      studentId: input.studentId,
      subskillId: subskill.id,
      level: "not_started" as MasteryLevel,
      evidenceSummary: "Joined this temporary workspace and has not submitted work yet.",
    })));
    return;
  }
}

export async function revokeTeacherWorkspaceSession(request: Request) {
  const sessionToken = parseTeacherWorkspaceCookie(request.headers.get("cookie"));
  if (!sessionToken || !validToken(sessionToken)) return;
  const client = configuredClient();
  if (!client) { localState.delete(tokenHash(sessionToken)); return; }
  const { error } = await client.from("teacher_demo_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", tokenHash(sessionToken)).is("revoked_at", null);
  if (error) throw new Error(`Could not end the teacher workspace: ${error.message}`);
}

export function resetTeacherWorkspaceStore() { localState.clear(); }
