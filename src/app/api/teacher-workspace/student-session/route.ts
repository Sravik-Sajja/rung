import { NextResponse } from "next/server";
import {
  createTeacherWorkspaceStudentSession,
  joinTeacherWorkspaceAsParticipant,
  teacherWorkspaceJoinSchema,
  teacherWorkspaceParticipantJoinSchema,
  resolveTeacherWorkspaceStudentSessionOnly,
  TEACHER_WORKSPACE_STUDENT_COOKIE,
  TEACHER_WORKSPACE_STUDENT_SESSION_MAX_AGE_SECONDS,
} from "@/lib/teacher-workspace/student-session";
import { isTeacherWorkspaceDemoMode } from "@/lib/teacher-workspace/session";
import {
  learnerSessionCookieClears,
  resolveLearnerSessions,
  revokeAllLearnerSessions,
  type LearnerSessions,
} from "@/lib/auth/learner-session";

export const dynamic = "force-dynamic";
function noStore(response: NextResponse) { response.headers.set("Cache-Control", "no-store"); return response; }
function publicStudent(student: { studentId: string; displayName: string; gradeBand: string; classId: string; assignmentId: string; expiresAt: string }) {
  return { studentId: student.studentId, displayName: student.displayName, gradeBand: student.gradeBand, classId: student.classId, assignmentId: student.assignmentId, expiresAt: student.expiresAt };
}

/**
 * Returns only the student session bound to this browser's opaque cookie.
 * Deliberately NOT built on resolveLearnerSessions: this route's whole
 * contract is "report the joined side," and its expired/invalid messages
 * name that side specifically. Folding in the participant side would let an
 * expired walkthrough cookie (with no joined cookie at all) report "your
 * joined workspace session expired," which names the wrong session.
 */
export async function GET(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    const result = await resolveTeacherWorkspaceStudentSessionOnly(request);
    if (result.kind === "resolved") return noStore(NextResponse.json({ student: publicStudent(result.student) }));
    const message = result.kind === "expired" ? "Your joined workspace session expired. Ask your teacher for a new code." : "Join a teacher workspace to continue.";
    return noStore(NextResponse.json({ error: message }, { status: result.kind === "missing_cookie" ? 404 : 401 }));
  } catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the joined student session." }, { status: 500 })); }
}

/** The server chooses the student ID, class, assignment, and opaque cookie. */
export async function POST(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  const body = await request.json().catch(() => null);

  // An existing learner keeps their student rather than minting a second one.
  // Only the cookie the server resolved here names them; the body carries the
  // code and nothing else. Resolution errors surface rather than being read as
  // "nobody is signed in" (see resolveLearnerSessions's own contract).
  let resolution: LearnerSessions["resolution"];
  try {
    ({ resolution } = await resolveLearnerSessions(request));
  } catch (error) {
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not resolve your session." }, { status: 500 }));
  }

  // Any resolved learner keeps their student rather than minting a second one.
  // `joinTeacherWorkspaceAsParticipant`'s RPC accepts a caller who holds a live
  // walkthrough participant session OR a live joined-student session (see
  // migration 021), so a joined-only learner switching classes now carries the
  // same student across instead of falling through to the fresh-join path. The
  // student id still comes only from the server-resolved cookie; the body
  // carries the code and nothing else.
  if (resolution.kind === "resolved") {
    const { learner } = resolution;
    const parsed = teacherWorkspaceParticipantJoinSchema.safeParse(body);
    if (!parsed.success) return noStore(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your join code." }, { status: 400 }));
    try {
      const student = await joinTeacherWorkspaceAsParticipant({
        joinCode: parsed.data.joinCode,
        participant: { studentId: learner.studentId, displayName: learner.displayName, gradeBand: learner.gradeBand },
      });
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

/**
 * Ends BOTH learner sessions and clears both cookies, not just this route's
 * own. A learner who also held the other cookie stayed signed in on that
 * side after "leaving class" otherwise - the one-sidedness this whole
 * reconciliation exists to remove.
 */
export async function DELETE(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    await revokeAllLearnerSessions(request);
    const response = noStore(NextResponse.json({ signedOut: true }));
    for (const cookie of learnerSessionCookieClears()) {
      response.cookies.set(cookie);
    }
    return response;
  } catch (error) {
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not end the joined student session." }, { status: 500 }));
  }
}
