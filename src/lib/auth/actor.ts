import { canonicalDemoStudents, canonicalDemoIds } from "@/lib/demo/contracts";
import { isDemoMode, resolveDemoParticipantSession } from "@/lib/demo/participant";
import { createServerSessionSupabaseClient } from "@/lib/supabase/server";

export type ActorStore = "local_demo" | "persisted";

function configuredDemoStore(): ActorStore {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "persisted"
    : "local_demo";
}

/**
 * Resolves the selected learner in isolated demo mode, or verifies that an
 * authenticated production caller owns the requested student record.
 */
export async function requireStudentActor(request: Request, requestedStudentId: string) {
  if (isDemoMode()) {
    const participantSession = await resolveDemoParticipantSession(request);
    if (participantSession.kind === "resolved") {
      if (participantSession.participant.studentId !== requestedStudentId) {
        throw new Error("This demo session belongs to another learner.");
      }
      return {
        studentId: participantSession.participant.studentId,
        mode: "demo" as const,
        // A durable participant already has a student, enrollment, and
        // mastery rows. Its progress must use Supabase so teacher data sees
        // the actual walkthrough, while a no-Supabase local participant stays
        // isolated in the in-memory rehearsal store.
        store: participantSession.participant.source === "supabase" ? "persisted" as const : "local_demo" as const,
        identity: "temporary_participant" as const,
        displayName: participantSession.participant.displayName,
      };
    }
    // An expired or malformed session must never fall through to Maya. That
    // would make a learner appear to have somebody else's progress.
    if (participantSession.kind === "expired") throw new Error("Your temporary demo session expired. Start a new climb to continue.");
    if (participantSession.kind === "invalid") throw new Error("Your temporary demo session is not valid. Start a new climb to continue.");

    // The approved Maya fallback remains available when no temporary session
    // exists. Seeded roster members stay usable for deterministic role demos,
    // but arbitrary client-provided IDs are rejected.
    if (!canonicalDemoStudents.some((student) => student.id === requestedStudentId)) throw new Error("Unknown demo student.");
    return {
      studentId: requestedStudentId,
      mode: "demo" as const,
      // Seeded demo IDs can use the durable flow when Supabase is configured;
      // local development remains fully runnable without credentials.
      store: configuredDemoStore(),
      identity: requestedStudentId === canonicalDemoIds.mayaStudentId ? "maya_fallback" as const : "seeded_demo" as const,
    };
  }
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (!accessToken) throw new Error("Sign in before accessing learner data.");
  const client = createServerSessionSupabaseClient(accessToken);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Your session is no longer valid.");
  const { data: student, error } = await client.from("students").select("id").eq("id", requestedStudentId).eq("auth_user_id", auth.user.id).maybeSingle();
  if (error || !student) throw new Error("You cannot access this learner record.");
  return { studentId: student.id, mode: "authenticated" as const, store: "persisted" as const };
}
