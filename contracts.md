# Rung Shared Contracts

**Status:** Phase-0 implementation contract  
**Companion document:** [architecture.md](./architecture.md)

This document defines the interfaces shared by the Domain/API, AI, and Student UI tracks. It is intentionally implementation-adjacent: the corresponding Zod schemas, inferred TypeScript types, fixtures, and route handlers must conform to these contracts.

## Ownership

| Area | Owner | Consumer |
| --- | --- | --- |
| AI adapter | Track B — AI | Track A — Domain/API |
| API DTOs and route handlers | Track A — Domain/API | Track C — Student UI |
| API fixtures | Phase 0, maintained by Track A | Track C — Student UI |

Track C consumes only these DTOs and fixtures. It must not invent alternative shapes. Track A calls the AI adapter interface; it must not call OpenAI directly.

## AI adapter

```ts
export type AiSource = "ai" | "cache" | "fallback";
export type HintLevel = "nudge" | "hint" | "guided_step";

export type AnswerSpec = {
  validation: "rational_equivalence";
  canonical: { numerator: number; denominator: number };
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

The adapter may not alter a deterministic score, mastery decision, or peer-unlock decision. The domain layer rejects diagnosis tags not in `supportedMisconceptionTags`, applies deterministic attempt checks, and maps verifier output to `verified`, `retry`, or `uncertain`.

`SafeItem` deliberately excludes answer-bearing fields. The server performs answer-leak checks only after a tutor result returns.

### Fallback contract

Phase 0 must seed and export typed fallback objects under the same schemas:

- `mayaDiagnosisFallback`
- `tutorHintFallbacksByItemAndLevel`
- `mayaAttemptVerificationFallback`
- `itemWrapFallbacksByItemId`

Every adapter invocation—AI, cache, fallback, or safety rejection—creates an `ai_runs` record and returns that `aiRunId`. Adapter implementations may change, but their inputs and outputs may not change without revising this document.

### Item-wrap invariant

`wrapItem` may alter only the learner-facing prompt. The parametric item's ID, operands, answer specification, distractor map, sub-skill, difficulty, solution steps, and computed answer remain unchanged. Re-freezing updates the prompt at the existing item ID; it never creates a new item.

## Student API

```ts
export type MasteryLevel =
  | "not_started"
  | "needs_support"
  | "developing"
  | "mastered";

export type SubmitResponseRequest =
  | {
      studentId: string;
      itemId: string;
      answer: string;
      context: "diagnostic";
      assignmentId: string;
    }
  | {
      studentId: string;
      itemId: string;
      answer: string;
      context: "practice";
      practiceSessionId: string;
    };

export type SubmitResponseResponse = {
  isCorrect: boolean;
  normalizedAnswer: { submitted: string; canonicalRational: string | null };
  responseId: string;
  feedback: { kind: "correct" | "try_again"; message: string };
  progress: {
    completedItemCount: number;
    totalItemCount: number;
    nextItemId: string | null;
    itemStatus?: "correct" | "missed" | "requeued";
    fullSolutionUnlocked?: boolean;
  };
};

export type CompleteDiagnosticRequest = { studentId: string };

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
};

export type GetDiagnosticResponse = {
  assignmentId: string;
  item: { id: string; prompt: string; subskillId: string; position: number } | null;
  progress: { completedItemCount: number; totalItemCount: number };
};

export type PracticeItemCard = {
  itemId: string;
  subskillId: string;
  prompt: string;
  difficulty: number;
  position: number;
  status: "pending" | "active" | "missed" | "requeued" | "correct";
  isResurfaced: boolean;
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
  itemId: string;
  attempt: string;
  level: HintLevel;
};

export type TutorHintResponse = TutorHint & { itemId: string };

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
  cells: HeatmapCell[];
  groups: Array<{ id: string; subskillId: string; label: string; studentIds: string[] }>;
};

export type TeacherGroupPlanResponse = {
  group: { id: string; subskillId: string; label: string; studentIds: string[] };
  plan: { content: string; source: AiSource; promptVersion: string };
  video: { title: string; provider: string; url: string; verificationNote: string };
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

## Routes

Track A owns these handlers or equivalent server actions:

| Route | Request | Response |
| --- | --- | --- |
| `POST /api/responses` | `SubmitResponseRequest` | `SubmitResponseResponse` |
| `GET /api/diagnostics/:assignmentId?studentId=...` | query parameter | `GetDiagnosticResponse` |
| `POST /api/diagnostics/:assignmentId/complete` | `CompleteDiagnosticRequest` | `CompleteDiagnosticResponse` |
| `GET /api/practice/:sessionId?studentId=...` | query parameter | `GetPracticeResponse` |
| `POST /api/tutor/hint` | `TutorHintRequest` | `TutorHintResponse` |
| `POST /api/peer-attempts` | `PeerAttemptRequest` | `PeerAttemptResponse` |
| `GET /api/peer-solutions/:itemId?studentId=...` | query parameter | `GetPeerSolutionResponse` |
| `GET /api/students/:studentId/mastery?topicId=...` | query parameter | `GetStudentMasteryResponse` |
| `GET /api/classes/:classId/dashboard` | none | `ClassDashboardResponse` |
| `GET /api/teacher-groups/:groupId/plan` | none | `TeacherGroupPlanResponse` |

## Phase-0 fixtures and constants

Export canonical IDs and fixtures with every contract above. Required fixtures are:

- `demoIds` for Maya, class, assignment, diagnostic item, gated practice item, practice session, common-denominator sub-skill, and misconception tags.
- `mayaResponseFixture`
- `mayaDiagnosticCompleteFixture`
- `mayaPracticeFixture`
- `mayaTutorHintFixture` for all three hint levels
- `mayaPeerAttemptFixture`
- `mayaPeerSolutionFixture` for `locked`, `approach`, and `full_solution` states
- `fractionsDashboardFixture`
- `commonDenominatorPlanFixture`

Fixtures use canonical seed IDs and must pass their Zod schemas. They exist so the UI can be built safely before every database-backed handler is complete; they are not an alternate API implementation.
