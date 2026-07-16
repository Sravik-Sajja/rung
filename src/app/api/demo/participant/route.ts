import { NextResponse } from "next/server";
import {
  createDemoParticipant,
  DEMO_PARTICIPANT_COOKIE,
  DEMO_PARTICIPANT_SESSION_MAX_AGE_SECONDS,
  demoParticipantNameSchema,
  isDemoMode,
  resolveDemoParticipantSession,
} from "@/lib/demo/participant";

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

/**
 * Lets a freshly loaded student surface resume a server-created temporary
 * learner. A missing cookie is intentionally not replaced with Maya.
 */
export async function GET(request: Request) {
  if (!isDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    const session = await resolveDemoParticipantSession(request);
    if (session.kind === "resolved") return noStore(NextResponse.json({ participant: publicParticipant(session.participant) }));
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
