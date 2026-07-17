import { isDemoMode, resolveDemoParticipantSession } from "@/lib/demo/participant";
import { resolveTeacherWorkspaceStudentSession } from "@/lib/teacher-workspace/student-session";
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
    const participantSession = await resolveDemoParticipantSession(request);
    if (participantSession.kind === "resolved") {
      const participant = participantSession.participant;
      if (participant.studentId !== requestedStudentId) {
        throw new Error("This demo session belongs to another learner.");
      }
      // A walkthrough learner can also hold a joined-class session for the same
      // student. Both cookies must be read: returning here on the participant
      // alone would leave that learner unable to open the class they joined.
      const joined = await resolveTeacherWorkspaceStudentSession(request).catch(() => null);
      const joinedStudent = joined?.kind === "resolved" && joined.student.studentId === participant.studentId
        ? joined.student
        : null;
      return {
        studentId: participant.studentId,
        mode: "demo" as const,
        // A durable participant already has a student, enrollment, and
        // mastery rows. Its progress must use Supabase so teacher data sees
        // the actual walkthrough, while a no-Supabase local participant stays
        // isolated in the in-memory rehearsal store.
        store: participant.source === "supabase" ? "persisted" as const : "local_demo" as const,
        identity: "temporary_participant" as const,
        displayName: participant.displayName,
        // Once this learner has joined a class, that class is their active
        // context and answers any request that names none: the walkthrough was
        // the on-ramp. Without this, finishing the class check-in and opening
        // "your skill climb" returned the untouched walkthrough matrix. The
        // walkthrough is still reachable by naming its class explicitly.
        classId: joinedStudent?.classId ?? participant.classId,
        classIds: joinedStudent ? [participant.classId, joinedStudent.classId] : [participant.classId],
        // Deliberately unbound, even when this learner also holds a joined-class
        // session. Joining a class only adds a class; binding the actor to the
        // joined assignment would lock the same learner out of the walkthrough
        // diagnostic they were already partway through. The joined class is
        // gated by classIds instead.
      };
    }
    // An expired or malformed session must never fall through to a seeded
    // learner. That would make a visitor appear to have somebody else's work.
    if (participantSession.kind === "expired") throw new Error("Your temporary demo session expired. Start a new climb to continue.");
    if (participantSession.kind === "invalid") throw new Error("Your temporary demo session is not valid. Start a new climb to continue.");

    // The teacher-workspace cookie is deliberately a different cookie and
    // session table from the public walkthrough. It remains assignment-bound
    // so a joined learner cannot use this actor to select another class.
    const teacherStudentSession = await resolveTeacherWorkspaceStudentSession(request);
    if (teacherStudentSession.kind === "resolved") {
      if (teacherStudentSession.student.studentId !== requestedStudentId) {
        throw new Error("This joined student session belongs to another learner.");
      }
      return {
        studentId: teacherStudentSession.student.studentId,
        classId: teacherStudentSession.student.classId,
        classIds: [teacherStudentSession.student.classId],
        assignmentId: teacherStudentSession.student.assignmentId,
        mode: "demo" as const,
        store: "persisted" as const,
        identity: "teacher_workspace_student" as const,
        displayName: teacherStudentSession.student.displayName,
      };
    }
    if (teacherStudentSession.kind === "expired") throw new Error("Your joined teacher workspace session expired. Ask your teacher for a new code.");
    if (teacherStudentSession.kind === "invalid") throw new Error("Your joined teacher workspace session is not valid. Ask your teacher for a new code.");

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
