import { NextResponse } from "next/server";
import {
  createDemoParticipant,
  DEMO_PARTICIPANT_COOKIE,
  DEMO_PARTICIPANT_SESSION_MAX_AGE_SECONDS,
  demoParticipantNameSchema,
  isDemoMode,
  revokeDemoParticipantSession,
  resolveDemoParticipantSession,
} from "@/lib/demo/participant";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { getDemoLearnerResume, type DemoLearnerResume } from "@/lib/student/demo-learning-store";
import { getPersistedLearnerResume, type PersistedLearnerResume } from "@/lib/student/learning-service";
import { resolveTeacherWorkspaceStudentSession } from "@/lib/teacher-workspace/student-session";

export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function publicParticipant(participant: {
  studentId: string;
  displayName: string;
  gradeBand: string;
  classId: string;
  expiresAt: string;
}) {
  return {
    studentId: participant.studentId,
    displayName: participant.displayName,
    gradeBand: participant.gradeBand,
    classId: participant.classId,
    expiresAt: participant.expiresAt,
  };
}

type LearnerResume = DemoLearnerResume | PersistedLearnerResume;

/**
 * Every resume path names the assignment or class it belongs to. Omitting them
 * made the student pages fall back to the canonical walkthrough assignment,
 * which a learner who had joined a class is not allowed to open.
 */
function publicResume(
  participant: { studentId: string },
  resume: LearnerResume,
  active: { assignmentId: string; classId: string },
) {
  const student = encodeURIComponent(participant.studentId);
  const assignment = encodeURIComponent(active.assignmentId);
  const klass = encodeURIComponent(active.classId);
  switch (resume.kind) {
    case "diagnostic":
      return { kind: resume.kind, nextPath: `/student/diagnostic?studentId=${student}&assignmentId=${assignment}&resume=1` };
    case "diagnosis":
      return {
        kind: resume.kind,
        nextPath: `/student/diagnosis?diagnosticSessionId=${encodeURIComponent(resume.diagnosticSessionId)}&studentId=${student}&assignmentId=${assignment}`,
      };
    case "practice":
      return { kind: resume.kind, nextPath: `/student/practice/${encodeURIComponent(resume.practiceSessionId)}?studentId=${student}` };
    case "mastery":
      return { kind: resume.kind, nextPath: `/student/mastery?studentId=${student}&classId=${klass}` };
    case "start":
      return { kind: resume.kind, nextPath: `/student/diagnostic?studentId=${student}&assignmentId=${assignment}` };
  }
}

/**
 * Resumes against the class this learner actually joined, not the walkthrough.
 * The joined session is server-resolved from its own cookie; the request body
 * and URL never select it.
 */
async function resumeForParticipant(
  request: Request,
  participant: { studentId: string; source: "local" | "supabase"; classId: string },
) {
  const joined = await resolveTeacherWorkspaceStudentSession(request).catch(() => null);
  const joinedStudent = joined?.kind === "resolved" && joined.student.studentId === participant.studentId
    ? joined.student
    : null;
  const active = {
    assignmentId: joinedStudent?.assignmentId ?? canonicalDemoIds.diagnosticAssignmentId,
    classId: joinedStudent?.classId ?? participant.classId,
  };
  const resume = participant.source === "local"
    ? getDemoLearnerResume(participant.studentId)
    : await getPersistedLearnerResume({
      studentId: participant.studentId,
      assignmentId: active.assignmentId,
    });
  return publicResume(participant, resume ?? { kind: "start" }, active);
}

/**
 * Answers "who is the learner in this browser, and where do they carry on?".
 *
 * A missing cookie is intentionally not replaced with Maya. Both learner kinds
 * count: a visitor who joined a class straight from a link holds only the
 * joined-student cookie, and reporting them as nobody made the demo page offer
 * to start a fresh climb for a learner who was already signed in.
 */
export async function GET(request: Request) {
  if (!isDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    const session = await resolveDemoParticipantSession(request);
    if (session.kind === "resolved") {
      return noStore(NextResponse.json({
        participant: publicParticipant(session.participant),
        resume: await resumeForParticipant(request, session.participant),
      }));
    }
    if (session.kind === "missing_cookie") {
      const joined = await resolveTeacherWorkspaceStudentSession(request).catch(() => null);
      if (joined?.kind === "resolved") {
        const student = joined.student;
        const active = { assignmentId: student.assignmentId, classId: student.classId };
        // A joined learner is always durable; there is no local rehearsal store
        // behind this identity.
        const resume = await getPersistedLearnerResume({ studentId: student.studentId, assignmentId: student.assignmentId });
        return noStore(NextResponse.json({
          participant: publicParticipant(student),
          resume: publicResume(student, resume ?? { kind: "start" }, active),
        }));
      }
    }
    if (session.kind === "expired") return noStore(NextResponse.json({ error: "Your temporary demo session expired. Start a new climb to continue." }, { status: 401 }));
    if (session.kind === "invalid") return noStore(NextResponse.json({ error: "Your temporary demo session is not valid. Start a new climb to continue." }, { status: 401 }));
    return noStore(NextResponse.json({ participant: null }, { status: 404 }));
  } catch (error) {
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the temporary learner." }, { status: 500 }));
  }
}

/**
 * Creates a temporary learner from a name only. The server owns both the
 * student ID and session token; JSON deliberately contains neither raw token
 * nor a way to select a pre-existing student.
 */
export async function POST(request: Request) {
  if (!isDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  const body = await request.json().catch(() => null) as { displayName?: unknown } | null;
  const parsed = demoParticipantNameSchema.safeParse(body?.displayName);
  if (!parsed.success) {
    return noStore(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a first name or nickname." }, { status: 400 }));
  }

  try {
    const participant = await createDemoParticipant({ displayName: parsed.data });
    const response = noStore(NextResponse.json({ participant: publicParticipant(participant) }, { status: 201 }));
    response.cookies.set({
      name: DEMO_PARTICIPANT_COOKIE,
      value: participant.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DEMO_PARTICIPANT_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the climb." }, { status: 500 }));
  }
}

/** Revokes the current temporary session and clears its browser cookie. */
export async function DELETE(request: Request) {
  if (!isDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    await revokeDemoParticipantSession(request);
    const response = noStore(NextResponse.json({ signedOut: true }));
    response.cookies.set({
      name: DEMO_PARTICIPANT_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not sign out." }, { status: 500 }));
  }
}
