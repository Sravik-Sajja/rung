import { NextResponse } from "next/server";
import { isTeacherWorkspaceDemoMode } from "@/lib/teacher-workspace/session";
import { previewTeacherWorkspaceJoinCode } from "@/lib/teacher-workspace/student-session";
import { resolveDemoParticipantSession } from "@/lib/demo/participant";

export const dynamic = "force-dynamic";

/**
 * Backs the join confirm screen: names the class behind a code and reports
 * whether this browser already holds a walkthrough learner. The code is
 * something the caller already has, so this reveals nothing that joining would
 * not. No session is created here.
 */
export async function GET(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const joinCode = new URL(request.url).searchParams.get("joinCode") ?? "";
  try {
    const [workspace, participantSession] = await Promise.all([
      previewTeacherWorkspaceJoinCode(joinCode),
      resolveDemoParticipantSession(request).catch(() => null),
    ]);
    const response = NextResponse.json({
      workspace,
      signedInAs: participantSession?.kind === "resolved"
        ? { displayName: participantSession.participant.displayName }
        : null,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read that join code." }, { status: 400 });
  }
}
