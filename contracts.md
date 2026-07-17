# Rung Shared Contracts

**Status:** Deployable MVP implementation contract
**Companion document:** [architecture.md](./architecture.md)

This document defines the interfaces shared by the Domain/API, AI, and Student UI tracks. It is intentionally implementation-adjacent: the corresponding Zod schemas, inferred TypeScript types, fixtures, and route handlers must conform to these contracts.

## Ownership

| Area | Owner | Consumer |
| --- | --- | --- |
| AI adapter | Track B — AI | Track A — Domain/API |
| API DTOs and route handlers | Track A — Domain/API | Track C — Student UI |
| API fixtures | Phase 0, maintained by Track A | Track C — Student UI |

Track C consumes only these DTOs and fixtures. It must not invent alternative shapes. Track A calls the AI adapter interface; it must not call OpenAI directly.

## Authentication and authorization boundary

Production requests resolve the actor from the Supabase Auth session; they do not trust a client-supplied identity. Route handlers must load the linked `profiles` record and enforce role and class membership before reading or mutating data. Supabase RLS is the database backstop for the same policy.

```ts
export type Actor =
  | { userId: string; role: "student"; studentId: string }
  | { userId: string; role: "teacher"; teacherId: string };
```

Student routes resolve a richer actor than the union above, via `requireStudentActor` (`src/lib/auth/actor.ts`). It is the real contract every student route enforces:

```ts
export type ActorStore = "local_demo" | "persisted";

export type StudentActor = {
  studentId: string;
  mode: "demo" | "authenticated";
  /** Which store answers for this learner. Chosen server-side; never client-selectable. */
  store: ActorStore;
  identity?: "temporary_participant" | "teacher_workspace_student";
  displayName?: string;
  /** The learner's home class. Used when a request names no assignment. */
  classId?: string;
  /** Every class this actor may act in. Mastery is class-scoped, so a caller-named class is checked against this list, never trusted. */
  classIds: string[];
  /** Only set when the session is bound to exactly one assignment. */
  assignmentId?: string;
};
```

- A student request carrying `studentId` is valid only when it equals `Actor.studentId`; new production clients should omit it where the route can derive it.
- Teachers may access only classes they teach and plans/snapshots created for those classes.
- The Supabase service role is never used in browser code and is not a substitute for a user session in normal routes.
- `DEMO_MODE` is disabled in production. In non-production there are two learner identities, each bound to its own opaque httpOnly cookie and each able to reach only its own learner's records: a server-created walkthrough `temporary_participant`, and a `teacher_workspace_student` who joined a class with a code. Seeded roster identities are never active learners on either. A URL/body `studentId` is a consistency assertion, never the source of identity.
- **`store` is not a preference; it is the storage boundary.** A walkthrough participant is `local_demo` only when Supabase is unconfigured, and `persisted` otherwise; a joined workspace student is always `persisted`. Code reachable from only one of these is effectively dead on a configured deployment — which is exactly how the per-student diagnostic bank sat unused for the entire Supabase path (see the 2026-07-17 log entry).
- **A learner may hold both cookies at once.** Joining a class adds a class rather than replacing one: both appear in `classIds`, the joined class becomes the default `classId`, and the actor stays deliberately assignment-unbound so the walkthrough diagnostic the learner was partway through remains reachable. `requireActorClass` rejects any caller-named class outside `classIds`.

### Temporary walkthrough participant

`POST /api/demo/participant` accepts `{ displayName }` (a 1–32 character first name or nickname) only while non-production demo mode is enabled. It creates a fictional student, enrollment, and initial `not_started` mastery matrix, returns public participant fields, and sets the opaque cookie. The raw cookie token is never returned in JSON.

```ts
export type DemoParticipant = {
  studentId: string;
  displayName: string;
  gradeBand: string;
  classId: string;
  expiresAt: string;
};

export type LearnerResume = {
  kind: "start" | "diagnostic" | "diagnosis" | "practice" | "mastery";
  /** A participant-owned next route; it contains no answer, score, or item key. */
  nextPath: string;
};

export type GetDemoParticipantResponse = {
  participant: DemoParticipant | null;
  resume?: LearnerResume;
};
export type CreateDemoParticipantResponse = { participant: DemoParticipant };
```

`GET /api/demo/participant` returns a cookie-owned, answer-free resume route: an unfinished diagnostic, pending diagnosis, active focused-practice session, mastery view, or the first diagnostic. Every resume path names the assignment or class it belongs to, so no caller falls back to the canonical walkthrough assignment. It answers for either learner kind: a walkthrough participant, or — when no participant cookie is present — a learner holding only a joined-class session, whose resume is scoped to that class's own assignment. It returns `404` with `participant: null` when neither cookie is present, and `401` for an invalid or expired participant cookie. It never silently substitutes a seeded learner. A temporary session lasts eight hours; the current seed reset removes durable temporary records, while background expiry cleanup is not yet implemented.

### Teacher demo workspace

Non-production only (`NODE_ENV !== "production"` and `DEMO_MODE=true`); every route below is `404` otherwise. A teacher opens a workspace, shares a join code, and learners join it. Three separate opaque httpOnly cookies exist — the walkthrough participant, the workspace owner, and the joined learner — each `path=/`, `sameSite=lax`, eight-hour max age, sha256-hashed at rest, and never returned in JSON. A joined-learner session dies with its parent workspace.

**Join code format.** Six random bytes rendered as three uppercase hex quads: `ABCD-EF01-2345`, matching `/^[A-F0-9]{4}(-[A-F0-9]{4}){2}$/`. The database RPC, the server schema, and the client validation must agree on this shape.

```ts
export type TeacherWorkspaceCell = { studentId: string; subskillId: string; level: MasteryLevel; evidenceSummary: string };
export type TeacherWorkspace = {
  classId: string;
  className: string;
  teacherDisplayName: string;
  assignmentId: string;
  assignmentTitle: string;
  joinCode: string;
  /** Only ever learners who actually joined. A new workspace ships no fictional roster. */
  students: DemoStudent[];
  subskills: Subskill[];
  cells: TeacherWorkspaceCell[];
};
/** The public projection of a joined learner. `source` is deliberately stripped. */
export type TeacherWorkspaceStudent = {
  studentId: string;
  displayName: string;
  gradeBand: string;
  classId: string;
  assignmentId: string;
  expiresAt: string;
};
export type TeacherWorkspacePreview = {
  workspace: { className: string; teacherDisplayName: string; assignmentTitle: string } | null;
  signedInAs: { displayName: string } | null;
};

export type CreateTeacherWorkspaceRequest = { teacherDisplayName: string; className: string };
/** A new learner supplies a name; an existing walkthrough participant supplies only the code. */
export type JoinTeacherWorkspaceRequest = { joinCode: string; displayName?: string };
export type JoinTeacherWorkspaceResponse = { student: TeacherWorkspaceStudent; joinedExisting?: true };
```

- **The join branch is chosen server-side, from the participant cookie — never from the body.** A visitor already holding a walkthrough session keeps their existing student record and gains a class-scoped mastery matrix rather than minting a second learner; `joinedExisting: true` marks that case. Only then may `displayName` be omitted. Nothing in the body can select an existing student.
- **`GET /api/teacher-workspace/join-preview?joinCode=` answers an unknown code with `200` and `workspace: null`, not `404`** — it feeds a confirm screen, and a hard error would let a caller probe which codes are live.
- **`DELETE /api/teacher-workspace/students/:studentId` takes its class from the owner cookie, never the URL.** Removal is scoped to that one class: the learner's `students` row and their walkthrough progress survive, and rejoining gives a clean slate rather than restoring a half-finished check-in.
- The owner cookie is cleared at both `/` and the legacy `/teacher-workspace` path, because a cookie scoped to the latter never reached `/api/teacher-workspace/*` and "End workspace" reported success while the session and its join code stayed live.

## AI adapter

```ts
export type AiSource = "ai" | "cache" | "fallback";
export type HintLevel = "nudge" | "hint" | "guided_step";
export type AiFeature =
  | "diagnosis_explanation"
  | "tutor_hint"
  | "work_analysis"
  | "attempt_verification"
  | "item_wrap"
  | "lesson_plan";

/** Environment-configured, allow-listed production model routes. */
export type AiModelRoute = "gpt-5.6-luna" | "gpt-5.6-terra";

export type AnswerRule =
  | { kind: "positive_common_multiple"; denominators: readonly [number, number] }
  | { kind: "exact_denominator"; denominator: number };

export type AnswerSpec = {
  accepted: string[];
  rule?: AnswerRule;
};

export type DiagnosisEvidence = {
  itemId: string;
  subskillId: string;
  misconceptionTag: string;
  selectedAnswer: string;
};

export type SafeItem = {
  id: string;
  subskillId: string;
  gradeBand: string;
  prompt: string;
  difficulty: number;
};

export type ParametricItem = {
  id: string;
  subskillId: string;
  gradeBand: string;
  difficulty: number;
  operands: Record<string, string>;
  prompt: string;
  answerSpec: AnswerSpec;
  distractorMap: Record<string, string>;
  solutionSteps: string[];
};

export type AiResultMeta = {
  source: AiSource;
  promptVersion: string;
  aiRunId: string;
  /** The configured approved model for an AI/cache result; `fallback` when no model response is used. */
  model: AiModelRoute | "fallback";
};

export type DiagnosisExplanation = AiResultMeta & {
  misconceptionTag: string;
  observation: string;
  explanation: string;
  nextStep: string;
};

export type TutorHint = AiResultMeta & {
  level: HintLevel;
  hint: string;
  leakCheck: "passed" | "fallback";
};

export type WorkAnalysis = AiResultMeta & {
  observation: string;
  nextStep: string;
  checkQuestion: string;
  imageRead: "not_provided" | "readable" | "unclear";
  leakCheck: "passed" | "fallback";
};

/**
 * Server-only input. `imageDataUrl`, answers, and solution steps are never
 * returned to the browser or stored in `ai_runs` as raw values.
 */
export type AnalyzeWorkInput = {
  studentId: string;
  item: SafeItem;
  writtenWork: string;
  imageDataUrl?: string;
  protectedAnswers: string[];
  /** Server-only accepted-answer variants derived from the item's answer rule. */
  protectedAnswerRule?: AnswerRule;
  protectedSolutionSteps: string[];
  promptVersion: string;
};

export type AttemptVerification = AiResultMeta & {
  onTopic: boolean;
  nonTrivial: boolean;
  reason: string;
  confidence: number;
};

export type ItemWrap = AiResultMeta & {
  itemId: string;
  prompt: string;
};

export interface RungAiAdapter {
  diagnoseExplanation(input: {
    studentId: string;
    assignmentId: string;
    gradeBand: string;
    targetSubskillId: string;
    supportedMisconceptionTags: [string, ...string[]];
    evidence: DiagnosisEvidence[];
    promptVersion: string;
  }): Promise<DiagnosisExplanation>;

  tutorHint(input: {
    studentId: string;
    item: SafeItem;
    attempt: string;
    level: HintLevel;
    promptVersion: string;
  }): Promise<TutorHint>;

  analyzeWork(input: AnalyzeWorkInput): Promise<WorkAnalysis>;

  verifyAttempt(input: {
    studentId: string;
    item: SafeItem;
    attemptText: string;
    explanation: string;
    normalizedAttemptText: string;
    promptVersion: string;
  }): Promise<AttemptVerification>;

  wrapItem(input: {
    item: ParametricItem;
    promptVersion: string;
  }): Promise<ItemWrap>;
}
```

Model routing is fixed by feature: Luna handles `tutorHint`, `analyzeWork`, and `wrapItem`; Terra handles `diagnoseExplanation` and teacher lesson-plan generation. `OPENAI_MODEL_WORK_ANALYSIS` is the optional server-only override for the Luna work-analysis route. The legacy verifier remains behind its old endpoint only while it is being retired. No UI route chooses a model.

The adapter may not alter a deterministic score, mastery decision, practice progression, or content-unlock decision. The domain layer rejects diagnosis tags not in `supportedMisconceptionTags`. Work analysis is coaching only; deterministic `answer_spec` scoring remains the correctness authority.

`SafeItem` deliberately excludes answer-bearing fields. The server performs answer-leak checks only after a tutor result returns.

### Live/cache/fallback contract

Every adapter call resolves through the same three tiers. A feature's `AiCacheMode` decides only whether the cache is consulted before or after the model; see architecture.md §6 for which features get which order and why.

1. If the feature is `cache_first`, look for a verified cache entry matching the feature, prompt version, and input hash. On a hit, validate it and return it without a model request.
2. Otherwise, or on a miss, make a live request to the routed GPT-5.6 model.
3. Validate its structured output and safety policy; only then store/use it as a verified cache entry.
4. On timeout, provider error, invalid schema, or policy rejection, a `live_first` feature falls back to a matching verified cache entry. A `cache_first` feature does not look twice — it already missed at step 1.
5. If no matching verified cache exists, return the typed safe fallback.

A cached payload is re-parsed and re-validated against the current schema and safety policy on every hit, in either order. An entry stored when a leak check was looser is rejected and drops through to the fallback rather than being served.

The order is configuration, not a constant. `DEFAULT_AI_CACHE_MODES` holds the reviewed defaults, `OPENAI_CACHE_MODE` overrides every feature, and `OPENAI_CACHE_MODE_<FEATURE>` overrides one. Tests pin the order explicitly via `createAiAdapter({ cacheModes })` rather than depending on the default.

Work-analysis fallback returns one safe generic observation, next step, and check question. It never claims whether work is correct, returns a protected answer or solution step, or changes progress. Diagnosis fallback may explain only the deterministically selected tag; tutor fallback must be non-answer-revealing; teacher-plan fallback is a seeded plan snapshot. Legacy peer-verification fallback remains fail-closed while the old endpoint exists.

Phase 0 must seed and export typed fallback objects under the same schemas:

- `mayaDiagnosisFallback`
- `tutorHintFallbacksByItemAndLevel`
- `workAnalysisFallback`
- `mayaAttemptVerificationFallback`
- `itemWrapFallbacksByItemId`

Every adapter invocation—AI, cache, fallback, or safety rejection—creates an `ai_runs` record and returns that `aiRunId`. The record contains an input hash and metadata only; it must never contain raw attempt text, typed work, photo bytes, or a photo data URL. Adapter implementations may change, but their inputs and outputs may not change without revising this document.

### Generated practice-plan contract

`generatePracticePlan` returns 3–4 items of exactly one supported kind for its target sub-skill: `number_line`, `equivalent_fraction`, `common_denominator`, or `fraction_operation`. It returns parameters only, never a prompt, answer, or solution. The server reconstructs the learner-facing item and scores it deterministically. If one returned item fails schema, target-kind, or math validation, reject the entire plan and use that skill's fallback plan; do not mix valid and invalid items.

### Teacher mini-lesson contract

generateTeacherLessonDraft receives a group label, sub-skill name, student count, practice-item count, and prompt version. It returns one objective, a pencil-and-paper-only materials list, 3–5 timed steps, and one check-for-understanding prompt.

The steps must follow warm-up, teacher model, guided work, matched practice, and exit check. Each activity is one concrete instruction of at most 120 characters. Their minutes must total 15â€“20; the lesson card derives its displayed duration from that total rather than from the seeded plan. The draft may refer generally to matched practice problems, but it must not repeat raw practice prompts, name learners, invent evidence, provide answer keys, or decide group membership. A failed or rejected call returns the same short, pencil-and-paper fallback shape. The cache key includes the prompt version; current teacher prompt version is teacher-lesson-v4.

### Student practice workspace contract

The diagnostic has no interactive workspaces. In practice, a workspace is selected deterministically by sub-skill and is never a scoring authority:

- fraction-number-line: the static visual specification is the question; the learner enters the represented fraction in the normal answer control.
- equivalent-fractions: a scale-factor table lets the learner supply the multiplier and new numerator; it does not shade or calculate the answer.
- unlike-denominator addition/subtraction: fraction bars support learner-selected partitions and shading.

Workspaces may copy the learner's constructed value into the answer field. Server-side deterministic scoring remains the only correctness authority.

### Item-wrap invariant

`wrapItem` may alter only the learner-facing prompt. The parametric item's ID, operands, answer specification, distractor map, sub-skill, difficulty, solution steps, and computed answer remain unchanged. It is an adapter capability, not the current seeded/rehearsal path. Before it can update a prompt, its validator result and provenance must be persisted at the existing item ID; it never creates a new item.

## Student API

```ts
export type MasteryLevel =
  | "not_started"
  | "needs_support"
  | "developing"
  | "mastered";

/** Learner-safe geometry sent separately from the server-only answer specification. */
export type ItemVisualSpec = {
  kind: "number_line";
  denominator: number;
  markedNumerator: number;
  pointLabel: string;
};

/** Current dashboard-only teacher action state; it is not a persisted assignment contract. */
export type HeatmapQuickAction =
  | { kind: "assign_follow_up"; studentId: string; subskillId: string }
  | { kind: "send_reminder"; studentId: string; subskillId: string }
  | { kind: "open_group_lesson"; groupId: string };

export type SubmitResponseRequest =
  | {
      studentId: string;
      itemId: string;
      answer: string;
      context: "diagnostic";
      diagnosticSessionId: string;
      usedHint?: boolean;
    }
  | {
      studentId: string;
      itemId: string;
      answer: string;
      context: "practice";
      practiceSessionId: string;
      practiceSessionItemId: string;
    };

export type SubmitDiagnosticResponse = {
  isCorrect: boolean;
  normalizedAnswer: string;
  responseId: string;
};

export type SubmitPracticeResponse = SubmitDiagnosticResponse & {
  masteryLevel: MasteryLevel;
  fullSolutionUnlocked?: boolean;
  practice: GetPracticeResponse;
};

export type SubmitResponseResponse = SubmitDiagnosticResponse | SubmitPracticeResponse;

export type CompleteDiagnosticRequest = { studentId: string; diagnosticSessionId: string };

export type CompleteDiagnosticResponse = {
  diagnosis: {
    selectedSubskillId: string;
    misconceptionTag: string;
    evidence: DiagnosisEvidence[];
    observation: string;
    explanation: string;
    nextStep: string;
    explanationSource: AiSource;
  };
  masterySnapshot: Array<{
    subskillId: string;
    level: MasteryLevel;
    evidenceCount: number;
  }>;
  practiceSession: {
    id: string;
    status: "active";
    firstItemId: string;
    itemCount: number;
  };
  /** One independently selectable plan for each missed sub-skill, prerequisite-first. Array order is authoritative. */
  practicePlans: Array<{
    id: string;
    targetSubskillId: string;
    title: string;
    reason: string;
    itemCount: number;
    firstItemId?: string;
    status?: "active" | "complete";
  }>;
};

Diagnostic completion projects only server-scored evidence into mastery exactly once: a miss yields `needs_support`; all-correct diagnostic evidence yields `developing`; a diagnostic never grants `mastered`; existing `mastered` remains stable. The local walkthrough and durable Supabase finalizer apply the same rule before the teacher dashboard reads its cells.

Teacher student detail receives `responseEvidenceByStudent`, keyed by student and then sub-skill. Each entry contains only `{ id, itemId, prompt, visualSpec?, answerRaw, isCorrect, context, submittedAt }`, ordered newest first. It never contains an answer specification/key, solution steps, distractor mapping, AI content, peer content, or raw work/photo data. The `prompt` is resolved through the response's own `itemId`, so it is the question that learner actually answered rather than the assignment's canonical slot — the two differ, because diagnostic items are generated per session.

export type GetDiagnosticResponse = {
  diagnosticSessionId: string;
  assignmentId: string;
  /**
   * This session's own items. `id` is session-scoped (`<slot>--<diagnosticSessionId>`),
   * not the canonical slot id in `assignment_items`, and it is the id every
   * `POST /api/responses` for this diagnostic must carry. Two learners in one class,
   * or one learner across two classes, receive different ids and different numbers.
   */
  items: Array<{ id: string; prompt: string; subskillId: string; visualSpec?: ItemVisualSpec; position: number }>;
};

export type PracticeItemCard = {
  /** Exact session occurrence; required for scoring and support-state requests. */
  practiceSessionItemId: string;
  itemId: string;
  subskillId: string;
  prompt: string;
  visualSpec?: ItemVisualSpec;
  difficulty: number;
  position: number;
  status: "pending" | "active" | "missed" | "requeued" | "correct";
  isResurfaced: boolean;
  /** Legacy response field during peer-gate retirement; the current Student UI ignores it. */
  peerGate: { approachUnlocked: boolean; fullSolutionUnlocked: boolean };
};

export type GetPracticeResponse = {
  session: {
    id: string;
    studentId: string;
    status: "active" | "complete";
    currentItemId: string | null;
  };
  items: PracticeItemCard[];
  progress: { completedItemCount: number; totalItemCount: number };
};

export type TutorHintRequest = {
  studentId: string;
  /** Optional compatibility field; never used to resolve a session-owned item. */
  itemId?: string;
  practiceSessionId: string;
  practiceSessionItemId: string;
  attempt: string;
  level: HintLevel;
};

export type TutorHintResponse = TutorHint & { itemId: string };

/** Multipart form fields. `photo` is optional JPEG/PNG/WebP, max 5 MiB. */
export type WorkHelpRequest = {
  studentId: string;
  /** Optional compatibility field; never used to resolve a session-owned item. */
  itemId?: string;
  practiceSessionId: string;
  practiceSessionItemId: string;
  writtenWork: string;
  supportLevel: "hint" | "guided_step";
  photo?: File;
};

export type WorkHelpResponse = WorkAnalysis & {
  itemId: string;
  supportLevel: "hint" | "guided_step";
};

The session-owned `practiceSessionId` + `practiceSessionItemId` form is the canonical tutor/work-help contract. The server authenticates ownership, resolves the item from the current occurrence, and records support events itself. A legacy catalog-only tutor hint may remain temporarily for old seed surfaces, but it cannot resolve generated content; catalog-only work help is rejected.

/** Legacy-only contract retained while old demo endpoints are removed. */
export type PeerAttemptRequest = {
  studentId: string;
  itemId: string;
  attemptText: string;
  explanation: string;
};

export type PeerAttemptResponse = {
  attemptSubmissionId: string;
  verification: {
    status: "verified" | "retry" | "uncertain";
    onTopic: boolean;
    nonTrivial: boolean;
    reason: string;
    source: AiSource | "deterministic";
  };
  unlocks: { approachUnlocked: boolean; fullSolutionUnlocked: boolean };
  retryMessage: string | null;
};

export type GetPeerSolutionResponse = {
  itemId: string;
  access: "locked" | "approach" | "full_solution";
  message?: string;
  peerSolution?: { authorAlias: string; approachText: string; fullSolution?: string };
};

export type HeatmapCell = {
  studentId: string;
  subskillId: string;
  level: MasteryLevel;
  evidenceSummary: string;
};

export type ClassDashboardResponse = {
  classId: string;
  students: Array<{ id: string; displayName: string; gradeBand: string }>;
  subskills: Array<{ id: string; name: string }>;
  cells: HeatmapCell[];
  /** Computed from current mastery on each dashboard read. */
  groups: Array<{ id: string; subskillId: string; label: string; studentIds: string[] }>;
};

export type TeacherGroupPlanResponse = {
  /** Persisted membership at selection time; it does not change if the dashboard later recomputes. */
  group: {
    id: string;
    subskillId: string;
    label: string;
    studentIds: string[];
    snapshotCreatedAt: string;
  };
  plan: {
    groupId: string;
    objective: string;
    durationMinutes: number;
    materials: string[];
    steps: Array<{ minutes: number; activity: string }>;
    checkForUnderstanding: string;
    practiceItemIds: string[];
    video: { title: string; provider: string; url: string; verificationNote: string };
  };
};

export type GetStudentMasteryResponse = {
  studentId: string;
  topicId: string;
  skills: Array<{
    subskillId: string;
    name: string;
    level: MasteryLevel;
    message: string;
    willComeBack: boolean;
  }>;
};
```

### Target production teacher behavior

Production student handlers resolve a Bearer Supabase access token and verify the linked learner. The browser sign-in/session UI is not yet implemented. Teacher dashboard and group-plan routes remain demo-read paths until an authenticated teacher-session and RLS-compatible membership check are wired; they must not be exposed as production teacher endpoints before then.

- `GET /api/classes/fractions-demo-class/dashboard` returns the canonical eight fictional students, five fraction sub-skills, their mastery cells, and deterministic support groups. Maya, Diego, and Zara form the `find-common-denominator` needs-support cohort.
- `GET /api/teacher-groups/:groupId/plan` returns a seeded/cached 15–18 minute plan with matched bank-item IDs and a resource record. The seeded group membership and cached plan are read-only in the current endpoint; a future selection workflow must create its own dated snapshot.
- A group is created only when at least two students have stored `needs_support` status for the same sub-skill. The UI does not use an AI model to choose mastery levels or group membership.

The handler does not yet attach `AiSource` or `promptVersion` metadata because plans are seeded cached content. Replace each placeholder video URL with its reviewed URL before rehearsal.

## Routes

Track A owns these handlers or equivalent server actions:

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/demo/participant` | non-production opaque participant cookie | `GetDemoParticipantResponse` or missing/expired/invalid status |
| `POST /api/demo/participant` | non-production `{ displayName }` | `CreateDemoParticipantResponse` plus opaque httpOnly cookie |
| `DELETE /api/demo/participant` | non-production, any learner cookie | `{ signedOut: true }`; ends every learner session held by this browser (both the participant and the joined-class-student sides) and clears both cookies |
| `POST /api/responses` | authenticated student + `SubmitResponseRequest` | `SubmitResponseResponse` |
| `GET /api/diagnostics/:assignmentId` | authenticated student | `GetDiagnosticResponse` |
| `POST /api/diagnostics/:assignmentId/complete` | authenticated student + `CompleteDiagnosticRequest` | `CompleteDiagnosticResponse` |
| `GET /api/practice/:sessionId` | authenticated student | `GetPracticeResponse` |
| `POST /api/tutor/hint` | authenticated student + `TutorHintRequest`; server resolves the owned exact occurrence | `TutorHintResponse` |
| `POST /api/work-help` | authenticated student + multipart `WorkHelpRequest`; server records/claims the earned exact-occurrence support state | `WorkHelpResponse` |
| `POST /api/peer-attempts` / `GET /api/peer-solutions/:itemId` | legacy only; must not be called by the current student UI | legacy peer contracts |
| `GET /api/students/:studentId/mastery?topicId=...` | authenticated student; ID must match actor | `GetStudentMasteryResponse` |
| `GET /api/classes/:classId/dashboard` | authenticated teacher assigned to class | `ClassDashboardResponse` |
| `GET /api/teacher-groups/:groupId/plan` | authenticated teacher assigned to group class | `TeacherGroupPlanResponse` |
| `POST /api/teacher-workspace/session` | non-production `CreateTeacherWorkspaceRequest` | `{ workspace: TeacherWorkspace }` (token/expiry stripped) plus opaque owner cookie |
| `GET /api/teacher-workspace/session` | non-production owner cookie | `{ workspace: TeacherWorkspace }`; `404` no cookie, `401` expired/invalid |
| `DELETE /api/teacher-workspace/session` | non-production owner cookie | `{ ended: true }`; revokes every joined-student session under it |
| `GET /api/teacher-workspace/join-preview?joinCode=` | non-production | `TeacherWorkspacePreview`; unknown code is `200` with a null workspace |
| `POST /api/teacher-workspace/student-session` | non-production `JoinTeacherWorkspaceRequest`; the branch comes from the server-resolved participant cookie | `JoinTeacherWorkspaceResponse` plus opaque joined-learner cookie |
| `GET /api/teacher-workspace/student-session` | non-production joined-learner cookie | `{ student }` |
| `DELETE /api/teacher-workspace/student-session` | non-production, any learner cookie | `{ signedOut: true }`; ends every learner session held by this browser (both the joined-class-student and the participant sides) and clears both cookies |
| `DELETE /api/teacher-workspace/students/:studentId` | non-production owner cookie; class comes from the cookie, never the URL | `{ removed: studentId }`; `404` when not in that class |

## Phase-0 fixtures and constants

Export canonical IDs and fixtures with every contract above. Required fixtures are:

- `demoIds` for Maya, class, assignment, diagnostic item, gated practice item, practice session, common-denominator sub-skill, and misconception tags.
- `mayaResponseFixture`
- `mayaDiagnosticCompleteFixture`
- `mayaPracticeFixture`
- `mayaTutorHintFixture` for all three hint levels
- `mayaWorkHelpFallbackFixture` for missed + hint and missed + guided-step states
- `fractionsDashboardFixture`
- `commonDenominatorPlanFixture`

Fixtures use canonical seed IDs and must pass their Zod schemas. They exist so the UI can be built safely before every database-backed handler is complete; they are not an alternate API implementation.
