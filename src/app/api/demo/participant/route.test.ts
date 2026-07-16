import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/demo/participant/route";
import { resetDemoParticipantStore } from "@/lib/demo/participant";

describe("/api/demo/participant", () => {
  beforeEach(() => {
    resetDemoParticipantStore();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  afterEach(() => {
    resetDemoParticipantStore();
    vi.unstubAllEnvs();
  });

  it("creates a temporary learner without exposing its session token in JSON", async () => {
    const response = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Kai" }),
    }));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { participant: { studentId: string; displayName: string; sessionToken?: string } };
    expect(body.participant.studentId).toMatch(/^demo-learner-/);
    expect(body.participant.displayName).toBe("Kai");
    expect(body.participant.sessionToken).toBeUndefined();

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("rung_demo_participant=");
    expect(setCookie).toContain("HttpOnly");
    const cookie = setCookie!.split(";")[0];
    const resumed = await GET(new Request("http://localhost/api/demo/participant", { headers: { cookie } }));
    expect(resumed.status).toBe(200);
    await expect(resumed.json()).resolves.toEqual({
      participant: expect.objectContaining({ studentId: body.participant.studentId, displayName: "Kai" }),
    });
  });

  it("rejects malformed names and production demo creation", async () => {
    const malformed = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "<script>" }),
    }));
    expect(malformed.status).toBe(400);

    vi.stubEnv("NODE_ENV", "production");
    const production = await POST(new Request("http://localhost/api/demo/participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Kai" }),
    }));
    expect(production.status).toBe(404);
  });
});
