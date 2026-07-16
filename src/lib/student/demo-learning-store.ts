import { canonicalDemoIds } from "@/lib/demo/contracts";
import { demoItems, demoMastery, demoSubskills } from "@/lib/demo-data";
import { scoreAnswer } from "@/lib/math/scoring";
import { buildDiagnosticItems } from "@/lib/items/diagnostic-items";
import { materializeGeneratedPracticePlan } from "@/lib/items/generated-practice-plan";
import { collectDiagnosticEvidence, nextMasteryLevel, selectDiagnosticGap, selectPracticeItems, shouldRequeue } from "@/lib/student/learning-loop";
import { createDemoSessionId, getDemoSession, resetDemoSessionState, setDemoSession } from "@/lib/student/demo-session-state";
import { isWorkHelpEligible, type PracticeSupportEvent, type PracticeSupportEventKind } from "@/lib/student/practice-support-state";
import type { Item, MasteryLevel } from "@/lib/types";
import type { GeneratedPracticePlan } from "@/lib/ai/contracts";

export type DemoPracticePlanSummary = {
  id: string;
  targetSubskillId: string;
  title: string;
  reason: string;
  itemCount: number;
  firstItemId?: string;
  status?: "active" | "complete";
};
type DiagnosticCompletion = { diagnosis: { selectedSubskillId: string; misconceptionTag: string; evidence: ReturnType<typeof collectDiagnosticEvidence>; practicePlanTargets: Array<{ subskillId: string; misconceptionTag: string }>; observation: string; explanation: string; nextStep: string; explanationSource: "fallback" }; practiceSession: { id: string; status: "active"; firstItemId: string | null; itemCount: number }; practicePlans?: DemoPracticePlanSummary[] };
// `items` is snapshotted onto the run at start: the five questions are built per student, so
// scoring and completion must read back the exact items that learner was shown, never rebuild them.
type DiagnosticRun = { id: string; studentId: string; assignmentId: string; items: Item[]; answers: Map<string, { answer: string; isCorrect: boolean; usedHint: boolean }>; completion?: DiagnosticCompletion; practicePlanGeneration?: Promise<DiagnosticCompletion> };
type PracticePlan = { subskillId: string; title: string; reason: string };
type PracticeOccurrence = { id: string; item: Item; position: number; status: "pending" | "missed" | "requeued" | "correct"; plan?: PracticePlan };
type PracticeRun = {
  id: string;
  studentId: string;
  topicId: string;
  items: PracticeOccurrence[];
  mastery: Map<string, { level: MasteryLevel; evidenceCount: number }>;
  supportEvents?: PracticeSupportEvent[];
};

const latestMastery = new Map<string, { level: MasteryLevel; evidenceCount: number }>();
const generatedPracticeItems = new Map<string, Item>();
let sequence = 0;

const prerequisites = new Map(demoSubskills.map((skill) => [
  skill.id,
  skill.id === "find-common-denominator"
    ? "equivalent-fractions"
    : skill.id === "add-unlike-denominators" || skill.id === "subtract-unlike-denominators"
      ? "find-common-denominator"
      : null,
] as const));

function id(prefix: string) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function supportEvents(run: PracticeRun) {
  // Preserve active demo sessions created before a hot reload added the
  // support-event field. This is local rehearsal state only.
  run.supportEvents ??= [];
  return run.supportEvents;
}

function recordSupportEvent(
  run: PracticeRun,
  occurrence: PracticeOccurrence,
  kind: PracticeSupportEventKind,
  eventId = id("practice-support-event"),
) {
  supportEvents(run).push({
    id: eventId,
    kind,
    itemId: occurrence.item.id,
    practiceSessionItemId: occurrence.id,
  });
  return eventId;
}

function currentPracticeOccurrence(run: PracticeRun) {
  // Keep the missed occurrence as the active card. It lets a learner request
  // help and retry the exact work they just attempted; an automatic requeue
  // remains a fallback occurrence, not a forced navigation jump.
  return run.items.find((entry) => entry.status !== "correct") ?? null;
}

export function startDemoDiagnostic(studentId: string = canonicalDemoIds.mayaStudentId) {
  const diagnosticSessionId = createDemoSessionId("diagnostic");
  // Same five skills, same order, same wording for everyone; only the numbers are per student.
  const items = buildDiagnosticItems(studentId);
  const run: DiagnosticRun = { id: diagnosticSessionId, studentId, assignmentId: canonicalDemoIds.diagnosticAssignmentId, items, answers: new Map() };
  setDemoSession("diagnostic", run.id, run);
  return {
    diagnosticSessionId: run.id,
    assignmentId: run.assignmentId,
    items: items.map((item, index) => ({ id: item.id, prompt: item.prompt, subskillId: item.subskillId, position: index + 1 })),
  };
}

export function recordDemoDiagnosticResponse(input: { diagnosticSessionId: string; studentId: string; itemId: string; answer: string; usedHint?: boolean }) {
  const run = getDemoSession<DiagnosticRun>("diagnostic", input.diagnosticSessionId);
  if (!run || run.studentId !== input.studentId) return null;
  // Score against this run's own item — the numbers are this learner's, not the seed bank's.
  const item = run.items.find((candidate) => candidate.id === input.itemId);
  if (!item) return null;
  const isCorrect = scoreAnswer(item, input.answer);
  run.answers.set(item.id, { answer: input.answer.trim(), isCorrect, usedHint: Boolean(input.usedHint) });
  return { isCorrect, responseId: id("diagnostic-response") };
}

export function completeDemoDiagnostic(input: { diagnosticSessionId: string; studentId: string }) {
  const run = getDemoSession<DiagnosticRun>("diagnostic", input.diagnosticSessionId);
  if (!run || run.studentId !== input.studentId) return null;
  const items = run.items;
  if (run.answers.size !== items.length) return null;
  if (run.completion) return run.completion;
  const evidence = collectDiagnosticEvidence(items, run.answers);
  const practicePlanTargets = [...new Map(evidence.filter((entry) => !entry.isCorrect).map((entry) => [entry.subskillId, entry])).values()]
    .map((entry) => ({ subskillId: entry.subskillId, misconceptionTag: entry.misconceptionTag ?? "needs-practice" }));
  const gap = selectDiagnosticGap(evidence, prerequisites) ?? {
    subskillId: canonicalDemoIds.commonDenominatorSubskillId,
    misconceptionTag: null,
    evidence: [],
  };
  const selected = selectPracticeItems(demoItems, gap.subskillId, prerequisites, 4);

  // Any question the student needed a hint on isn't "known yet" — so resurface more of exactly that
  // subskill. For each hinted subskill we append its bank items not already queued (or one extra rep
  // if it has none left), guaranteeing the student sees more of the kinds they leaned on.
  const hintedSubskillIds = new Set(
    [...run.answers].flatMap(([itemId, answer]) =>
      answer.usedHint ? items.filter((item) => item.id === itemId).map((item) => item.subskillId) : [],
    ),
  );
  const practiceBank: Item[] = [...selected];
  for (const subskillId of hintedSubskillIds) {
    const bank = demoItems.filter((candidate) => candidate.subskillId === subskillId);
    const fresh = bank.filter((candidate) => !practiceBank.some((queued) => queued.id === candidate.id));
    practiceBank.push(...(fresh.length ? fresh : bank.slice(0, 1)));
  }

  const practice: PracticeRun = {
    id: createDemoSessionId("practice"),
    studentId: input.studentId,
    topicId: canonicalDemoIds.fractionsTopicId,
    items: practiceBank.map((item, index) => ({ id: id("practice-item"), item, position: index + 1, status: "pending" })),
    mastery: new Map(),
    supportEvents: [],
  };
  setDemoSession("practice", practice.id, practice);
  const completion: DiagnosticCompletion = {
    diagnosis: {
      selectedSubskillId: gap.subskillId,
      misconceptionTag: gap.misconceptionTag ?? "no_recognized_distractor",
      evidence: gap.evidence,
      practicePlanTargets,
      observation: "Your answers show that this skill is the next useful step.",
      explanation: "We will practice this prerequisite before moving to harder fraction problems.",
      nextStep: "Start the focused practice set.",
      explanationSource: "fallback" as const,
    },
    practiceSession: { id: practice.id, status: "active" as const, firstItemId: practice.items[0]?.item.id ?? null, itemCount: practice.items.length },
  };
  run.completion = completion;
  return completion;
}

/**
 * A diagnostic completion may be submitted twice by a double-click or retry.
 * Keep one in-flight plan build per local session, then cache the fully
 * applied result so every later request receives the same session IDs.
 */
export async function getOrCreateDemoDiagnosticPracticePlans(input: {
  diagnosticSessionId: string;
  studentId: string;
  build: () => Promise<{
    practicePlans: DemoPracticePlanSummary[];
    firstItemId: string;
    firstItemCount: number;
  }>;
}) {
  const run = getDemoSession<DiagnosticRun>("diagnostic", input.diagnosticSessionId);
  if (!run || run.studentId !== input.studentId || !run.completion) return null;
  if (run.completion.practicePlans) return run.completion;
  if (run.practicePlanGeneration) return run.practicePlanGeneration;

  const promise = input.build()
    .then((generated) => {
      if (!generated.practicePlans.length || !generated.firstItemId) {
        throw new Error("Could not create a complete generated practice plan.");
      }
      run.completion!.practiceSession.firstItemId = generated.firstItemId;
      run.completion!.practiceSession.itemCount = generated.firstItemCount;
      run.completion!.practicePlans = generated.practicePlans;
      return run.completion!;
    })
    .finally(() => {
      if (run.practicePlanGeneration === promise) run.practicePlanGeneration = undefined;
    });
  run.practicePlanGeneration = promise;
  return promise;
}

export function getDemoPractice(sessionId: string, studentId: string) {
  const run = getDemoSession<PracticeRun>("practice", sessionId);
  if (!run || run.studentId !== studentId) return null;
  const current = run.items.find((entry) => entry.status !== "correct") ?? null;
  return {
    session: { id: run.id, studentId: run.studentId, status: current ? "active" as const : "complete" as const, currentItemId: current?.item.id ?? null },
    items: run.items.map((entry) => ({
      practiceSessionItemId: entry.id,
      itemId: entry.item.id,
      subskillId: entry.item.subskillId,
      prompt: entry.item.prompt,
      difficulty: 1,
      position: entry.position,
      status: entry.status,
      isResurfaced: entry.status === "requeued",
      plan: entry.plan,
      peerGate: { approachUnlocked: false, fullSolutionUnlocked: false },
    })),
  };
}

/** Creates an empty local session that will be populated only by a validated generated plan. */
export function createGeneratedDemoPracticeSession(studentId: string) {
  const id = createDemoSessionId("practice");
  setDemoSession("practice", id, { id, studentId, topicId: canonicalDemoIds.fractionsTopicId, items: [], mastery: new Map(), supportEvents: [] } satisfies PracticeRun);
  return id;
}

/** Lets server-only helpers (such as tutor hints) resolve a generated item without trusting client prompt text. */
export function findGeneratedDemoPracticeItem(itemId: string) {
  return generatedPracticeItems.get(itemId) ?? null;
}

export function findDemoPracticeSessionItem(input: { practiceSessionId: string; studentId: string; itemId: string }) {
  const run = getDemoSession<PracticeRun>("practice", input.practiceSessionId);
  if (!run || run.studentId !== input.studentId) return null;
  return run.items.find((entry) => entry.item.id === input.itemId)?.item ?? null;
}

/** Replaces a newly-created demo session with AI-planned operands only after deterministic math validation. */
export function applyGeneratedDemoPracticePlan(input: { practiceSessionId: string; studentId: string; targetSubskillId: string; items: GeneratedPracticePlan["items"] }) {
  return applyGeneratedDemoPracticePlans({ practiceSessionId: input.practiceSessionId, studentId: input.studentId, plans: [{ targetSubskillId: input.targetSubskillId, misconceptionTag: "needs-practice", items: input.items }] });
}

/** Replaces a fresh demo session with one validated, labeled mini-plan per missed skill. */
export function applyGeneratedDemoPracticePlans(input: { practiceSessionId: string; studentId: string; plans: Array<{ targetSubskillId: string; misconceptionTag: string; items: GeneratedPracticePlan["items"] }> }) {
  const run = getDemoSession<PracticeRun>("practice", input.practiceSessionId);
  if (!run || run.studentId !== input.studentId || !input.plans.length || run.items.some((item) => item.status !== "pending")) return null;
  try {
    // Materialize every plan before changing the session. If any target is
    // invalid, the existing pending session remains untouched for a retry.
    const items = input.plans.flatMap((plan, planIndex) =>
      materializeGeneratedPracticePlan({
        targetSubskillId: plan.targetSubskillId,
        items: plan.items,
        itemIdAt: (itemIndex) => `ai-practice-${run.id}-${planIndex + 1}-${itemIndex + 1}`,
      }).map((item) => ({
        item,
        plan: {
          subskillId: plan.targetSubskillId,
          title: demoSubskills.find((skill) => skill.id === plan.targetSubskillId)?.name ?? plan.targetSubskillId,
          reason: `Assigned because this skill was missed in the check-in (${plan.misconceptionTag.replaceAll("_", " ")}).`,
        },
      })),
    );
    if (items.length < 3 || !items.every(({ item }) => item.id.startsWith("ai-practice-"))) return null;
    run.items = items.map(({ item, plan }, index) => ({ id: id("practice-item"), item, plan, position: index + 1, status: "pending" }));
    run.items.forEach(({ item }) => generatedPracticeItems.set(item.id, item));
    return { firstItemId: run.items[0].item.id, itemCount: run.items.length };
  } catch {
    return null;
  }
}

/** Records a server-side tutor request only after session ownership and current-occurrence checks. */
export function recordDemoPracticeSupportHint(input: {
  practiceSessionId: string;
  practiceSessionItemId: string;
  studentId: string;
  level: "nudge" | "hint" | "guided_step";
}) {
  const run = getDemoSession<PracticeRun>("practice", input.practiceSessionId);
  const occurrence = run?.items.find((entry) => entry.id === input.practiceSessionItemId);
  if (!run || run.studentId !== input.studentId || !occurrence || occurrence !== currentPracticeOccurrence(run)) return false;
  recordSupportEvent(run, occurrence, input.level);
  return true;
}

/**
 * Atomically reserves the one work-help response for the demo run. The route
 * releases this event if the AI boundary fails, so a transient failure never
 * consumes the learner's one eligible escalation.
 */
export function claimDemoPracticeWorkHelp(input: {
  practiceSessionId: string;
  practiceSessionItemId: string;
  studentId: string;
}) {
  const run = getDemoSession<PracticeRun>("practice", input.practiceSessionId);
  const occurrence = run?.items.find((entry) => entry.id === input.practiceSessionItemId);
  if (
    !run
    || run.studentId !== input.studentId
    || !occurrence
    || occurrence !== currentPracticeOccurrence(run)
    || occurrence.status !== "missed"
    || !isWorkHelpEligible(supportEvents(run), occurrence.item.id)
  ) return null;

  return recordSupportEvent(run, occurrence, "work_help_claimed", id("work-help-claim"));
}

export function releaseDemoPracticeWorkHelpClaim(input: {
  practiceSessionId: string;
  practiceSessionItemId: string;
  studentId: string;
  claimId: string;
}) {
  const run = getDemoSession<PracticeRun>("practice", input.practiceSessionId);
  if (!run || run.studentId !== input.studentId) return false;
  const events = supportEvents(run);
  const index = events.findIndex((event) => (
    event.id === input.claimId
    && event.kind === "work_help_claimed"
    && event.practiceSessionItemId === input.practiceSessionItemId
  ));
  if (index < 0) return false;
  events.splice(index, 1);
  return true;
}

export function recordDemoPracticeResponse(input: { practiceSessionId: string; practiceSessionItemId: string; studentId: string; answer: string }) {
  const run = getDemoSession<PracticeRun>("practice", input.practiceSessionId);
  const occurrence = run?.items.find((entry) => entry.id === input.practiceSessionItemId);
  // The current missed item stays available for real retries. A queued
  // duplicate must not be submitted out of order, because that would make the
  // miss -> hint -> later-miss sequence ambiguous.
  if (!run || run.studentId !== input.studentId || !occurrence || occurrence !== currentPracticeOccurrence(run)) return null;
  const isCorrect = scoreAnswer(occurrence.item, input.answer);
  const statuses = run.items.filter((entry) => entry.item.id === occurrence.item.id).map((entry) => entry.status);
  occurrence.status = isCorrect ? "correct" : "missed";
  recordSupportEvent(run, occurrence, isCorrect ? "correct" : "miss");
  if (!isCorrect && shouldRequeue(statuses)) {
    run.items.push({ id: id("practice-item"), item: occurrence.item, position: run.items.length + 1, status: "requeued" });
  }
  if (isCorrect) {
    // The UI intentionally keeps the missed original occurrence in place for
    // retries. Once it is solved, remove its untouched fallback duplicate so
    // it cannot become a stale, impossible extra question.
    run.items = run.items.filter((entry) => (
      entry.id === occurrence.id
      || entry.item.id !== occurrence.item.id
      || (entry.status !== "pending" && entry.status !== "requeued")
    ));
  }
  const prior = run.mastery.get(occurrence.item.subskillId) ?? { level: "needs_support" as MasteryLevel, evidenceCount: 0 };
  const prerequisite = prerequisites.get(occurrence.item.subskillId);
  const prerequisiteState = prerequisite ? run.mastery.get(prerequisite) : undefined;
  const nextMastery = nextMasteryLevel(prior.level, prior.evidenceCount, isCorrect, prerequisiteState?.level === "needs_support");
  run.mastery.set(occurrence.item.subskillId, nextMastery);
  latestMastery.set(`${input.studentId}:${occurrence.item.subskillId}`, nextMastery);
  const practice = getDemoPractice(run.id, run.studentId)!;
  return { isCorrect, responseId: id("practice-response"), masteryLevel: nextMastery.level, practice };
}

export function getDemoStudentMastery(studentId: string) {
  return demoSubskills.map((subskill) => {
    const updated = latestMastery.get(`${studentId}:${subskill.id}`);
    const seeded = demoMastery.find((record) => record.studentId === studentId && record.subskillId === subskill.id);
    return {
      subskillId: subskill.id,
      name: subskill.name,
      level: updated?.level ?? seeded?.level ?? "not_started",
      message: updated ? "Updated from your focused practice." : seeded?.evidenceSummary ?? "No evidence yet.",
      willComeBack: (updated?.level ?? seeded?.level ?? "not_started") !== "mastered",
    };
  });
}

/** Clears the local-only fallback between tests or an explicit demo reset. */
export function resetDemoLearningStore() {
  resetDemoSessionState();
  latestMastery.clear();
  generatedPracticeItems.clear();
  sequence = 0;
}
