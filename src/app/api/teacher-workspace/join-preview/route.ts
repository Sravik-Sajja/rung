import { NextResponse } from "next/server";
import { isTeacherWorkspaceDemoMode } from "@/lib/teacher-workspace/session";
import { previewTeacherWorkspaceJoinCode } from "@/lib/teacher-workspace/student-session";
import { resolveLearnerSessions } from "@/lib/auth/learner-session";

export const dynamic = "force-dynamic";

/**
 * Backs the join confirm screen: names the class behind a code and reports
 * whether this browser already holds a walkthrough learner. The code is
 * something the caller already has, so this reveals nothing that joining would
 * not. No session is created here.
 *
 * `signedInAs` reports ANY resolved learner, not just a walkthrough
 * participant: when it is set, the confirm screen POSTs only `{ joinCode }`
 * (no displayName) to /student-session, and that route's durable join-as-
 * existing-learner path now accepts any resolved learner — a joined-only
 * learner included (its RPC accepts a live joined-student session; see
 * migration 021). So skipping the name field for a joined-only learner is
 * correct: their follow-up POST reuses the student the server resolved from
 * their cookie. Uses resolveLearnerSessions (not the narrower participant-only
 * resolver) so this stays reconciled with the other cookie: a learner whose
 * participant cookie merged with or lost to a joined cookie is judged the
 * same way requireStudentActor would judge them.
 */
export async function GET(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const joinCode = new URL(request.url).searchParams.get("joinCode") ?? "";
  try {
    const [workspace, { resolution }] = await Promise.all([
      previewTeacherWorkspaceJoinCode(joinCode),
      resolveLearnerSessions(request),
    ]);
    const response = NextResponse.json({
      workspace,
      signedInAs: resolution.kind === "resolved"
        ? { displayName: resolution.learner.displayName }
        : null,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read that join code." }, { status: 400 });
  }
}
