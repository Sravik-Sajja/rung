import { NextResponse } from "next/server";
import {
  createTeacherWorkspaceStudentSession,
  joinTeacherWorkspaceAsParticipant,
  revokeTeacherWorkspaceStudentSession,
  teacherWorkspaceJoinSchema,
  teacherWorkspaceParticipantJoinSchema,
  resolveTeacherWorkspaceStudentSession,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
  TEACHER_WORKSPACE_STUDENT_SESSION_MAX_AGE_SECONDS,
} from "@/lib/teacher-workspace/student-session";
import { isTeacherWorkspaceDemoMode } from "@/lib/teacher-workspace/session";
import { resolveDemoParticipantSession } from "@/lib/demo/participant";

export const dynamic = "force-dynamic";
function noStore(response: NextResponse) { response.headers.set("Cache-Control", "no-store"); return response; }
function publicStudent(student: { studentId: string; displayName: string; gradeBand: string; classId: string; assignmentId: string; expiresAt: string }) {
  return { studentId: student.studentId, displayName: student.displayName, gradeBand: student.gradeBand, classId: student.classId, assignmentId: student.assignmentId, expiresAt: student.expiresAt };
}
function clearCookie(response: NextResponse) {
  response.cookies.set({ name: TEACHER_WORKSPACE_STUDENT_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

/** Returns only the student session bound to this browser's opaque cookie. */
export async function GET(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    const result = await resolveTeacherWorkspaceStudentSession(request);
    if (result.kind === "resolved") return noStore(NextResponse.json({ student: publicStudent(result.student) }));
    const message = result.kind === "expired" ? "Your joined workspace session expired. Ask your teacher for a new code." : "Join a teacher workspace to continue.";
    return noStore(NextResponse.json({ error: message }, { status: result.kind === "missing_cookie" ? 404 : 401 }));
  } catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the joined student session." }, { status: 500 })); }
}

/** The server chooses the student ID, class, assignment, and opaque cookie. */
export async function POST(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  const body = await request.json().catch(() => null);

  // An existing walkthrough learner keeps their student. Only the cookie the
  // server resolved here names them; the body carries the code and nothing else.
  const participantSession = await resolveDemoParticipantSession(request).catch(() => null);
  if (participantSession?.kind === "resolved") {
    const parsed = teacherWorkspaceParticipantJoinSchema.safeParse(body);
    if (!parsed.success) return noStore(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your join code." }, { status: 400 }));
    try {
      const student = await joinTeacherWorkspaceAsParticipant({ joinCode: parsed.data.joinCode, participant: participantSession.participant });
      const response = noStore(NextResponse.json({ student: publicStudent(student), joinedExisting: true }, { status: 201 }));
      response.cookies.set({ name: TEACHER_WORKSPACE_STUDENT_COOKIE, value: student.sessionToken, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TEACHER_WORKSPACE_STUDENT_SESSION_MAX_AGE_SECONDS });
      return response;
    } catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not join the class." }, { status: 400 })); }
  }

  const parsed = teacherWorkspaceJoinSchema.safeParse(body);
  if (!parsed.success) return noStore(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your name and join code." }, { status: 400 }));
  try {
    const student = await createTeacherWorkspaceStudentSession(parsed.data);
    const response = noStore(NextResponse.json({ student: publicStudent(student) }, { status: 201 }));
    response.cookies.set({ name: TEACHER_WORKSPACE_STUDENT_COOKIE, value: student.sessionToken, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TEACHER_WORKSPACE_STUDENT_SESSION_MAX_AGE_SECONDS });
    return response;
  } catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not join the teacher workspace." }, { status: 400 })); }
}

export async function DELETE(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try { await revokeTeacherWorkspaceStudentSession(request); return clearCookie(noStore(NextResponse.json({ signedOut: true }))); }
  catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not end the joined student session." }, { status: 500 })); }
}
