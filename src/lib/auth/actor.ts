import { isDemoMode } from "@/lib/demo/participant";
import { resolveLearnerSessions } from "@/lib/auth/learner-session";
import { createServerSessionSupabaseClient } from "@/lib/supabase/server";

export type ActorStore = "local_demo" | "persisted";

export type StudentActor = {
  studentId: string;
  mode: "demo" | "authenticated";
  store: ActorStore;
  identity?: "temporary_participant" | "teacher_workspace_student";
  displayName?: string;
  /** The learner's home class. Used when a request names no assignment. */
  classId?: string;
  /**
   * Every class this actor may act in. Mastery is class-scoped, so a caller
   * that names a class must be checked against this list rather than trusted.
   */
  classIds: string[];
  /** Only set when the session is bound to exactly one assignment. */
  assignmentId?: string;
};

/**
 * Resolves the selected learner in isolated demo mode, or verifies that an
 * authenticated production caller owns the requested student record.
 */
export async function requireStudentActor(request: Request, requestedStudentId: string): Promise<StudentActor> {
  if (isDemoMode()) {
    const { resolution } = await resolveLearnerSessions(request);
    if (resolution.kind === "resolved") {
      const { learner } = resolution;
      // An expired or malformed session must never fall through to a seeded
      // learner. That would make a visitor appear to have somebody else's work.
      // The message names whichever cookie actually carries this learner's
      // identity, so a mismatch is reported in the vocabulary that identity uses.
      if (learner.studentId !== requestedStudentId) {
        throw new Error(
          learner.identity === "temporary_participant"
            ? "This demo session belongs to another learner."
            : "This joined student session belongs to another learner.",
        );
      }
      return {
        studentId: learner.studentId,
        mode: "demo" as const,
        store: learner.store,
        identity: learner.identity,
        displayName: learner.displayName,
        classId: learner.activeClassId,
        classIds: learner.classIds,
        assignmentId: learner.boundAssignmentId ?? undefined,
      };
    }
    if (resolution.kind === "expired") {
      throw new Error(
        resolution.which === "participant"
          ? "Your temporary demo session expired. Start a new climb to continue."
          : "Your joined teacher workspace session expired. Ask your teacher for a new code.",
      );
    }
    if (resolution.kind === "invalid") {
      throw new Error(
        resolution.which === "participant"
          ? "Your temporary demo session is not valid. Start a new climb to continue."
          : "Your joined teacher workspace session is not valid. Ask your teacher for a new code.",
      );
    }
    throw new Error("Start your climb before accessing learner work.");
  }
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (!accessToken) throw new Error("Sign in before accessing learner data.");
  const client = createServerSessionSupabaseClient(accessToken);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Your session is no longer valid.");
  const { data: student, error } = await client.from("students").select("id").eq("id", requestedStudentId).eq("auth_user_id", auth.user.id).maybeSingle();
  if (error || !student) throw new Error("You cannot access this learner record.");
  const { data: enrollments, error: enrollmentError } = await client.from("class_enrollments").select("class_id").eq("student_id", student.id);
  if (enrollmentError) throw new Error(enrollmentError.message);
  const classIds = ((enrollments ?? []) as Array<{ class_id: string }>).map((row) => row.class_id);
  return { studentId: student.id, mode: "authenticated" as const, store: "persisted" as const, classId: classIds[0], classIds };
}

/** Rejects a caller-supplied class that this actor is not enrolled in. */
export function requireActorClass(actor: StudentActor, requestedClassId: string | null | undefined) {
  const classId = requestedClassId ?? actor.classId;
  if (!classId) throw new Error("This learner is not enrolled in any class.");
  if (!actor.classIds.includes(classId)) throw new Error("This session cannot access that class.");
  return classId;
}
