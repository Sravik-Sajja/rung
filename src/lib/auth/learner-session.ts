// A single browser can hold two independent learner cookies for the same
// student: the public walkthrough participant and a joined-class student.
// Every "who is this?" call site used to read only one of them, which let a
// second, equally valid cookie go unseen. This module is the one place that
// reconciles both before any caller decides who the learner is.
import {
  DEMO_PARTICIPANT_COOKIE,
  resolveDemoParticipantSessionOnly,
  revokeDemoParticipantSession,
  type DemoParticipant,
  type DemoParticipantSessionResolution,
} from "@/lib/demo/participant";
import {
  TEACHER_WORKSPACE_STUDENT_COOKIE,
  resolveTeacherWorkspaceStudentSessionOnly,
  revokeTeacherWorkspaceStudentSession,
  type TeacherWorkspaceStudent,
  type TeacherWorkspaceStudentSessionResolution,
} from "@/lib/teacher-workspace/student-session";

export type LearnerSessionSide =
  | { state: "missing_cookie" }
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "error"; message: string }
  | { state: "resolved" };

export type ResolvedLearner = {
  studentId: string;
  displayName: string;
  gradeBand: string;
  /** Set iff the participant cookie resolved to THIS student. */
  participant: DemoParticipant | null;
  /** Set iff the joined-class cookie resolved to THIS student. */
  joined: TeacherWorkspaceStudent | null;
  /** The joined class wins over the walkthrough whenever both are held. */
  activeClassId: string;
  /** Every class this learner may act in. */
  classIds: string[];
  /** Non-null ONLY for a joined-only learner. */
  boundAssignmentId: string | null;
  store: "local_demo" | "persisted";
  identity: "temporary_participant" | "teacher_workspace_student";
};

export type LearnerSessions = {
  sides: { participant: LearnerSessionSide; joined: LearnerSessionSide };
  resolution:
    | { kind: "resolved"; learner: ResolvedLearner }
    | { kind: "none" }
    | { kind: "expired"; which: "participant" | "joined" }
    | { kind: "invalid"; which: "participant" | "joined" };
};

function toSide<T extends { kind: string }>(settled: PromiseSettledResult<T>): LearnerSessionSide {
  if (settled.status === "rejected") {
    const reason = settled.reason;
    return { state: "error", message: reason instanceof Error ? reason.message : String(reason) };
  }
  const { kind } = settled.value;
  if (kind === "resolved") return { state: "resolved" };
  return { state: kind } as LearnerSessionSide;
}

/**
 * Resolves both learner cookies concurrently (independent queries) and
 * reconciles them into a single learner, in priority order:
 *
 * 1. Both resolved, same student: merged. The participant identity wins
 *    (it is the durable teaching record); the joined class becomes active.
 * 2. Both resolved, different students: the participant cookie wins and the
 *    joined side is dropped from the learner, even though it did resolve.
 * 3. Exactly one side resolved: that learner, even if the other side is
 *    expired/invalid/errored. A server-verified valid cookie always beats a
 *    stale one — an expired participant cookie must never block a valid
 *    joined session.
 * 4. Neither resolved: "expired" if either side expired (participant checked
 *    first, so it wins ties), else "invalid" if either is invalid
 *    (participant first), else "none".
 * 5. Neither resolved and any side errored: rethrow. An infrastructure
 *    outage must never be reported as "nobody is signed in".
 */
export async function resolveLearnerSessions(request: Request, now: Date = new Date()): Promise<LearnerSessions> {
  const [participantSettled, joinedSettled] = await Promise.allSettled([
    resolveDemoParticipantSessionOnly(request, now),
    resolveTeacherWorkspaceStudentSessionOnly(request, now),
  ]);

  const sides = { participant: toSide(participantSettled), joined: toSide(joinedSettled) };

  const participant: DemoParticipant | null =
    participantSettled.status === "fulfilled" && participantSettled.value.kind === "resolved"
      ? participantSettled.value.participant
      : null;
  const joined: TeacherWorkspaceStudent | null =
    joinedSettled.status === "fulfilled" && joinedSettled.value.kind === "resolved"
      ? joinedSettled.value.student
      : null;

  if (participant && joined && participant.studentId === joined.studentId) {
    return {
      sides,
      resolution: {
        kind: "resolved",
        learner: {
          studentId: participant.studentId,
          displayName: participant.displayName,
          gradeBand: participant.gradeBand,
          participant,
          joined,
          activeClassId: joined.classId,
          classIds: [participant.classId, joined.classId],
          // Deliberately unbound, even though this learner also holds a
          // joined-class session. Binding the actor to the joined assignment
          // would lock the same learner out of the walkthrough diagnostic
          // they were already partway through. The joined class is gated by
          // classIds instead.
          boundAssignmentId: null,
          // A durable participant already has a student, enrollment, and
          // mastery rows and must use Supabase so teacher data sees the
          // actual walkthrough; a no-Supabase local participant stays
          // isolated in the in-memory rehearsal store.
          store: participant.source === "supabase" ? "persisted" : "local_demo",
          identity: "temporary_participant",
        },
      },
    };
  }

  if (participant && joined) {
    // Different students under the same browser. The participant cookie is
    // the walkthrough identity this browser is actively driving; the joined
    // side did resolve (sides still reports it), but it names someone else.
    return {
      sides,
      resolution: {
        kind: "resolved",
        learner: {
          studentId: participant.studentId,
          displayName: participant.displayName,
          gradeBand: participant.gradeBand,
          participant,
          joined: null,
          activeClassId: participant.classId,
          classIds: [participant.classId],
          boundAssignmentId: null,
          store: participant.source === "supabase" ? "persisted" : "local_demo",
          identity: "temporary_participant",
        },
      },
    };
  }

  if (participant) {
    return {
      sides,
      resolution: {
        kind: "resolved",
        learner: {
          studentId: participant.studentId,
          displayName: participant.displayName,
          gradeBand: participant.gradeBand,
          participant,
          joined: null,
          activeClassId: participant.classId,
          classIds: [participant.classId],
          boundAssignmentId: null,
          store: participant.source === "supabase" ? "persisted" : "local_demo",
          identity: "temporary_participant",
        },
      },
    };
  }

  if (joined) {
    return {
      sides,
      resolution: {
        kind: "resolved",
        learner: {
          studentId: joined.studentId,
          displayName: joined.displayName,
          gradeBand: joined.gradeBand,
          participant: null,
          joined,
          activeClassId: joined.classId,
          classIds: [joined.classId],
          boundAssignmentId: joined.assignmentId,
          // Always persisted, even when joined.source === "local": a joined
          // session always has a real student, enrollment, and assignment
          // row created through the workspace join RPC (or its local-store
          // equivalent seeding the same shape), unlike a no-Supabase
          // participant which is purely in-memory.
          store: "persisted",
          identity: "teacher_workspace_student",
        },
      },
    };
  }

  // Neither side resolved. An outage on either side must surface as an
  // error, never as a quiet "nobody is signed in" — that would let a
  // learner mid-session look logged out because of an infrastructure blip.
  if (participantSettled.status === "rejected") throw participantSettled.reason;
  if (joinedSettled.status === "rejected") throw joinedSettled.reason;

  const participantKind = (participantSettled.value as DemoParticipantSessionResolution).kind;
  const joinedKind = (joinedSettled.value as TeacherWorkspaceStudentSessionResolution).kind;
  if (participantKind === "expired" || joinedKind === "expired") {
    return { sides, resolution: { kind: "expired", which: participantKind === "expired" ? "participant" : "joined" } };
  }
  if (participantKind === "invalid" || joinedKind === "invalid") {
    return { sides, resolution: { kind: "invalid", which: participantKind === "invalid" ? "participant" : "joined" } };
  }
  return { sides, resolution: { kind: "none" } };
}

/**
 * Ends both learner cookies' sessions. Both revokes are attempted even if
 * one throws first, so a broken table on one side can never preserve the
 * other session past a sign-out.
 */
export async function revokeAllLearnerSessions(request: Request): Promise<void> {
  const [participantResult, joinedResult] = await Promise.allSettled([
    revokeDemoParticipantSession(request),
    revokeTeacherWorkspaceStudentSession(request),
  ]);
  if (participantResult.status === "rejected") throw participantResult.reason;
  if (joinedResult.status === "rejected") throw joinedResult.reason;
}

/** Framework-free cookie-clear descriptors a route feeds to `response.cookies.set`. */
export function learnerSessionCookieClears(): Array<{
  name: string;
  value: "";
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: 0;
}> {
  const secure = process.env.NODE_ENV === "production";
  return [
    { name: DEMO_PARTICIPANT_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 },
    { name: TEACHER_WORKSPACE_STUDENT_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 },
  ];
}
