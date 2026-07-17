import { NextResponse } from "next/server";
import {
  createTeacherWorkspace,
  isTeacherWorkspaceDemoMode,
  revokeTeacherWorkspaceSession,
  teacherWorkspaceSetupSchema,
  TEACHER_WORKSPACE_COOKIE,
  TEACHER_WORKSPACE_SESSION_MAX_AGE_SECONDS,
  resolveTeacherWorkspaceSession,
} from "@/lib/teacher-workspace/session";

export const dynamic = "force-dynamic";
function noStore(response: NextResponse) { response.headers.set("Cache-Control", "no-store"); return response; }
function clearCookie(response: NextResponse) {
  response.cookies.set({ name: TEACHER_WORKSPACE_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  // Owner cookies issued before the path fix below live at /teacher-workspace.
  // A browser holding one would keep sending it, so expire that one too.
  response.cookies.set({ name: TEACHER_WORKSPACE_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/teacher-workspace", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try {
    const result = await resolveTeacherWorkspaceSession(request);
    if (result.kind === "resolved") return noStore(NextResponse.json({ workspace: result.workspace }));
    return noStore(NextResponse.json({ error: "Start a teacher workspace to continue." }, { status: result.kind === "missing_cookie" ? 404 : 401 }));
  } catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the teacher workspace." }, { status: 500 })); }
}

export async function POST(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  const body = await request.json().catch(() => null);
  const parsed = teacherWorkspaceSetupSchema.safeParse(body);
  if (!parsed.success) return noStore(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the workspace details." }, { status: 400 }));
  try {
    const workspace = await createTeacherWorkspace(parsed.data);
    const response = noStore(NextResponse.json({ workspace: { ...workspace, sessionToken: undefined, expiresAt: undefined } }, { status: 201 }));
    // Path "/" so the workspace's own API routes receive it, matching the
    // joined-student cookie. Scoped to /teacher-workspace it never reached
    // /api/teacher-workspace/*, so "End workspace" cleared the cookie and
    // reported success while the session and its join code stayed live.
    response.cookies.set({ name: TEACHER_WORKSPACE_COOKIE, value: workspace.sessionToken, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TEACHER_WORKSPACE_SESSION_MAX_AGE_SECONDS });
    return response;
  } catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the teacher workspace." }, { status: 500 })); }
}

export async function DELETE(request: Request) {
  if (!isTeacherWorkspaceDemoMode()) return noStore(NextResponse.json({ error: "Not found" }, { status: 404 }));
  try { await revokeTeacherWorkspaceSession(request); return clearCookie(noStore(NextResponse.json({ ended: true }))); }
  catch (error) { return noStore(NextResponse.json({ error: error instanceof Error ? error.message : "Could not end the teacher workspace." }, { status: 500 })); }
}
