import { canonicalDemoIds, canonicalDiagnosticItemIds } from "@/lib/demo/contracts";
import { demoItems, demoMastery, demoSubskills } from "@/lib/demo-data";
import { scoreAnswer } from "@/lib/math/scoring";
import { collectDiagnosticEvidence, nextMasteryLevel, selectDiagnosticGap, selectPracticeItems, shouldRequeue } from "@/lib/student/learning-loop";
import { createDemoSessionId, getDemoSession, resetDemoSessionState, setDemoSession } from "@/lib/student/demo-session-state";
import type { Item, MasteryLevel } from "@/lib/types";

type DiagnosticRun = { id: string; studentId: string; assignmentId: string; answers: Map<string, { answer: string; isCorrect: boolean; usedHint: boolean }> };
type PracticeOccurrence = { id: string; item: Item; position: number; status: "pending" | "missed" | "requeued" | "correct" };
type PracticeRun = { id: string; studentId: string; topicId: string; items: PracticeOccurrence[]; mastery: Map<string, { level: MasteryLevel; evidenceCount: number }> };

const latestMastery = new Map<string, { level: MasteryLevel; evidenceCount: number }>();
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
  const evidence = collectDiagnosticEvidence(items, run.answers);
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
  return {
    diagnosis: {
      selectedSubskillId: gap.subskillId,
      misconceptionTag: gap.misconceptionTag ?? "no_recognized_distractor",
      evidence: gap.evidence,
      observation: "Your answers show that this skill is the next useful step.",
      explanation: "We will practice this prerequisite before moving to harder fraction problems.",
      nextStep: "Start the focused practice set.",
      explanationSource: "fallback" as const,
    },
    practiceSession: { id: practice.id, status: "active" as const, firstItemId: practice.items[0]?.item.id ?? null, itemCount: practice.items.length },
  };
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
      peerGate: { approachUnlocked: false, fullSolutionUnlocked: false },
    })),
  };
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
  sequence = 0;
}
