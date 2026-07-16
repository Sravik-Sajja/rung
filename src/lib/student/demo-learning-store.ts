import { canonicalDemoIds, canonicalDiagnosticItemIds } from "@/lib/demo/contracts";
import { demoItems, demoMastery, demoSubskills } from "@/lib/demo-data";
import { scoreAnswer } from "@/lib/math/scoring";
import { createFractionOperationItem, validateParametricFractionItem } from "@/lib/items/fraction-generator";
import { collectDiagnosticEvidence, nextMasteryLevel, selectDiagnosticGap, selectPracticeItems, shouldRequeue } from "@/lib/student/learning-loop";
import { createDemoSessionId, getDemoSession, resetDemoSessionState, setDemoSession } from "@/lib/student/demo-session-state";
import type { Item, MasteryLevel } from "@/lib/types";
import type { GeneratedPracticePlan } from "@/lib/ai/contracts";

type DiagnosticCompletion = { diagnosis: { selectedSubskillId: string; misconceptionTag: string; evidence: ReturnType<typeof collectDiagnosticEvidence>; practicePlanTargets: Array<{ subskillId: string; misconceptionTag: string }>; observation: string; explanation: string; nextStep: string; explanationSource: "fallback" }; practiceSession: { id: string; status: "active"; firstItemId: string | null; itemCount: number }; practicePlans?: Array<{ id: string; title: string; reason: string; itemCount: number }> };
type DiagnosticRun = { id: string; studentId: string; assignmentId: string; answers: Map<string, { answer: string; isCorrect: boolean; usedHint: boolean }>; completion?: DiagnosticCompletion };
type PracticePlan = { subskillId: string; title: string; reason: string };
type PracticeOccurrence = { id: string; item: Item; position: number; status: "pending" | "missed" | "requeued" | "correct"; plan?: PracticePlan };
type PracticeRun = { id: string; studentId: string; topicId: string; items: PracticeOccurrence[]; mastery: Map<string, { level: MasteryLevel; evidenceCount: number }> };

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

function diagnosticItems() {
  return canonicalDiagnosticItemIds.map((itemId) => demoItems.find((item) => item.id === itemId)).filter((item): item is Item => Boolean(item));
}

export function startDemoDiagnostic(studentId: string = canonicalDemoIds.mayaStudentId) {
  const diagnosticSessionId = createDemoSessionId("diagnostic");
  const run: DiagnosticRun = { id: diagnosticSessionId, studentId, assignmentId: canonicalDemoIds.diagnosticAssignmentId, answers: new Map() };
  setDemoSession("diagnostic", run.id, run);
  return {
    diagnosticSessionId: run.id,
    assignmentId: run.assignmentId,
    items: diagnosticItems().map((item, index) => ({ id: item.id, prompt: item.prompt, subskillId: item.subskillId, position: index + 1 })),
  };
}

export function recordDemoDiagnosticResponse(input: { diagnosticSessionId: string; studentId: string; itemId: string; answer: string; usedHint?: boolean }) {
  const run = getDemoSession<DiagnosticRun>("diagnostic", input.diagnosticSessionId);
  const item = diagnosticItems().find((candidate) => candidate.id === input.itemId);
  if (!run || run.studentId !== input.studentId || !item) return null;
  const isCorrect = scoreAnswer(item, input.answer);
  run.answers.set(item.id, { answer: input.answer.trim(), isCorrect, usedHint: Boolean(input.usedHint) });
  return { isCorrect, responseId: id("diagnostic-response") };
}

export function completeDemoDiagnostic(input: { diagnosticSessionId: string; studentId: string }) {
  const run = getDemoSession<DiagnosticRun>("diagnostic", input.diagnosticSessionId);
  const items = diagnosticItems();
  if (!run || run.studentId !== input.studentId || run.answers.size !== items.length) return null;
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
  setDemoSession("practice", id, { id, studentId, topicId: canonicalDemoIds.fractionsTopicId, items: [], mastery: new Map() } satisfies PracticeRun);
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
  if (!run || run.studentId !== input.studentId || run.items.some((item) => item.status !== "pending")) return null;
  try {
    const items = input.plans.flatMap((plan, planIndex) => plan.items.map((generated, index) => ({
      item: generated.kind === "fraction_operation" ? createFractionOperationItem({ id: `ai-practice-${run.id}-${planIndex + 1}-${index + 1}`, operation: generated.operation, left: { numerator: generated.leftNumerator, denominator: generated.leftDenominator }, right: { numerator: generated.rightNumerator, denominator: generated.rightDenominator }, subskillId: plan.targetSubskillId, difficulty: index + 1 }) : generated.kind === "number_line" ? { id: `ai-practice-${run.id}-${planIndex + 1}-${index + 1}`, subskillId: plan.targetSubskillId, prompt: `Which point is ${generated.numerator}/${generated.denominator} of the way from 0 to 1?`, answerSpec: { accepted: [`${generated.numerator}/${generated.denominator}`] }, distractorMap: {} } : generated.kind === "equivalent_fraction" ? { id: `ai-practice-${run.id}-${planIndex + 1}-${index + 1}`, subskillId: plan.targetSubskillId, prompt: `What fraction is equivalent to ${generated.numerator}/${generated.denominator} when both parts are multiplied by ${generated.multiplier}?`, answerSpec: { accepted: [`${generated.numerator * generated.multiplier}/${generated.denominator * generated.multiplier}`] }, distractorMap: {} } : { id: `ai-practice-${run.id}-${planIndex + 1}-${index + 1}`, subskillId: plan.targetSubskillId, prompt: `What is a common denominator for 1/${generated.leftDenominator} and 1/${generated.rightDenominator}?`, answerSpec: { accepted: [String(generated.leftDenominator * generated.rightDenominator)] }, distractorMap: {} },
      plan: { subskillId: plan.targetSubskillId, title: demoSubskills.find((skill) => skill.id === plan.targetSubskillId)?.name ?? plan.targetSubskillId, reason: `Assigned because this skill was missed in the check-in (${plan.misconceptionTag.replaceAll("_", " ")}).` },
    })));
    if (items.length < 3 || !items.every(({ item }) => item.id.startsWith("ai-practice-"))) return null;
    run.items = items.map(({ item, plan }, index) => ({ id: id("practice-item"), item, plan, position: index + 1, status: "pending" }));
    run.items.forEach(({ item }) => generatedPracticeItems.set(item.id, item));
    return { firstItemId: run.items[0].item.id, itemCount: run.items.length };
  } catch {
    return null;
  }
}

export function recordDemoPracticeResponse(input: { practiceSessionId: string; practiceSessionItemId: string; studentId: string; answer: string }) {
  const run = getDemoSession<PracticeRun>("practice", input.practiceSessionId);
  const occurrence = run?.items.find((entry) => entry.id === input.practiceSessionItemId);
  if (!run || run.studentId !== input.studentId || !occurrence) return null;
  const isCorrect = scoreAnswer(occurrence.item, input.answer);
  const statuses = run.items.filter((entry) => entry.item.id === occurrence.item.id).map((entry) => entry.status);
  occurrence.status = isCorrect ? "correct" : "missed";
  if (!isCorrect && shouldRequeue(statuses)) {
    run.items.push({ id: id("practice-item"), item: occurrence.item, position: run.items.length + 1, status: "requeued" });
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
