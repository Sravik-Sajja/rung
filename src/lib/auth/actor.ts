import { canonicalDemoStudents } from "@/lib/demo/contracts";
import { createServerSessionSupabaseClient } from "@/lib/supabase/server";

/**
 * Resolves the selected learner in isolated demo mode, or verifies that an
 * authenticated production caller owns the requested student record.
 */
export async function requireStudentActor(request: Request, requestedStudentId: string) {
  const demoMode = process.env.DEMO_MODE === "true" || (process.env.NODE_ENV === "development" && process.env.DEMO_MODE !== "false");
  if (demoMode) {
    if (!canonicalDemoStudents.some((student) => student.id === requestedStudentId)) throw new Error("Unknown demo student.");
    return { studentId: requestedStudentId, mode: "demo" as const };
  }
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (!accessToken) throw new Error("Sign in before accessing learner data.");
  const client = createServerSessionSupabaseClient(accessToken);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Your session is no longer valid.");
  const { data: student, error } = await client.from("students").select("id").eq("id", requestedStudentId).eq("auth_user_id", auth.user.id).maybeSingle();
  if (error || !student) throw new Error("You cannot access this learner record.");
  return { studentId: student.id, mode: "authenticated" as const };
}
