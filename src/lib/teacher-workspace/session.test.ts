import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import {
  createTeacherWorkspace,
  isTeacherWorkspaceDemoMode,
  parseTeacherWorkspaceCookie,
  resetTeacherWorkspaceStore,
  resolveTeacherWorkspaceSession,
  TEACHER_WORKSPACE_COOKIE,
} from "@/lib/teacher-workspace/session";

describe("temporary teacher workspace", () => {
  beforeEach(() => {
    mocks.createClient.mockReset(); resetTeacherWorkspaceStore();
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });
  afterEach(() => { resetTeacherWorkspaceStore(); vi.unstubAllEnvs(); });

  it("is disabled in production with DEMO_MODE alone", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    expect(isTeacherWorkspaceDemoMode()).toBe(false);
  });

  it("enables the explicitly opted-in hosted demo in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("ALLOW_DEMO_IN_PROD", "true");
    expect(isTeacherWorkspaceDemoMode()).toBe(true);
  });

  it("binds an isolated empty class to an opaque cookie without seeded demo IDs", async () => {
    const workspace = await createTeacherWorkspace({ teacherDisplayName: " Ms. Jordan ", className: " Period 3 fractions " });
    expect(workspace.source).toBe("local");
    expect(workspace.classId).toMatch(/^teacher-demo-class-/);
    expect(workspace.classId).not.toBe("fractions-demo-class");
    // A workspace ships no fictional roster: real joiners must never share a
    // table with invented evidence.
    expect(workspace.students).toHaveLength(0);
    expect(workspace.cells).toHaveLength(0);
    // Columns still exist so an empty workspace renders a heatmap.
    expect(workspace.subskills.length).toBeGreaterThan(0);

    const request = new Request("http://localhost/teacher-workspace", { headers: { cookie: `${TEACHER_WORKSPACE_COOKIE}=${workspace.sessionToken}` } });
    await expect(resolveTeacherWorkspaceSession(request)).resolves.toEqual({ kind: "resolved", workspace: expect.objectContaining({ classId: workspace.classId, className: "Period 3 fractions", teacherDisplayName: "Ms. Jordan" }) });
    await expect(resolveTeacherWorkspaceSession(new Request("http://localhost/teacher-workspace", { headers: { cookie: `${TEACHER_WORKSPACE_COOKIE}=not-a-real-token` } }))).resolves.toEqual({ kind: "invalid" });
  });

  it("parses only its own cookie", () => {
    expect(parseTeacherWorkspaceCookie(`other=value; ${TEACHER_WORKSPACE_COOKIE}=abc%2Ddef`)).toBe("abc-def");
    expect(parseTeacherWorkspaceCookie("rung_demo_participant=abc")).toBeNull();
  });
});
