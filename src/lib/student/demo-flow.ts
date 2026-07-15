// Deterministic local fallback for the student API flow. Supabase-backed services can replace this boundary without changing route contracts.
import { fallbackAiAdapter } from "@/lib/ai/adapter";
import { canonicalDemoIds, canonicalDemoSubskillIds } from "@/lib/demo/contracts";
import { demoDiagnosticItems, demoItems, demoStudents, findDemoItem } from "@/lib/demo-data";
import { scoreAnswer } from "@/lib/math/scoring";
import type { Item, MasteryLevel } from "@/lib/types";

type SubmittedResponse = { id: string; studentId: string; itemId: string; answer: string; isCorrect: boolean; context: "diagnostic" | "practice" };
type PracticeStatus = "pending" | "active" | "missed" | "requeued" | "correct";
type PracticeEntry = { itemId: string; position: number; status: PracticeStatus; isResurfaced: boolean };
type PracticeSession = { id: string; studentId: string; entries: PracticeEntry[]; };
type PeerUnlock = { approach: boolean; fullSolution: boolean };

type DemoFlowStore = { responses: SubmittedResponse[]; sessions: Map<string, PracticeSession>; peerUnlocks: Map<string, PeerUnlock> };

declare global {
  // Shared only within a running local server process; Supabase replaces this store for deployment.
  // eslint-disable-next-line no-var
  var __rungDemoFlowStore: DemoFlowStore | undefined;
}

const store: DemoFlowStore = globalThis.__rungDemoFlowStore ?? { responses: [], sessions: new Map(), peerUnlocks: new Map() };
globalThis.__rungDemoFlowStore = store;
const { responses, sessions, peerUnlocks } = store;
const diagnosticItemIds = new Set(demoDiagnosticItems.map((item) => item.id));
const practiceItemIds = ["common-denominator-1", "add-unlike-1", "subtract-unlike-1"];

/** Test-only reset for the process-local demo fallback. Production persistence belongs in Supabase. */
export function resetLocalDemoFlow() {
  responses.splice(0, responses.length);
  sessions.clear();
  peerUnlocks.clear();
}

function isKnownStudent(studentId: string) { return demoStudents.some((student) => student.id === studentId); }
function peerKey(studentId: string, itemId: string) { return `${studentId}:${itemId}`; }
function sessionIdFor(studentId: string) { return `practice-${studentId}-common-denominator`; }

export function recordLocalResponse(input: { studentId: string; itemId: string; answer: string; context: "diagnostic" | "practice"; practiceSessionId?: string }) {
  if (!isKnownStudent(input.studentId)) return { error: "Unknown demo student" as const };
  const item = findDemoItem(input.itemId);
  if (!item) return { error: "Unknown demo item" as const };
  const isCorrect = scoreAnswer(item, input.answer);
  const response = { id: `response-${responses.length + 1}`, studentId: input.studentId, itemId: input.itemId, answer: input.answer.trim(), isCorrect, context: input.context };
  responses.push(response);
  if (input.context === "practice") updatePracticeEntry(input.studentId, input.itemId, isCorrect, input.practiceSessionId);
  if (isCorrect) {
    const unlock = peerUnlocks.get(peerKey(input.studentId, input.itemId));
    if (unlock) unlock.fullSolution = true;
  }
  return { response, item };
}

export async function completeLocalDiagnostic(assignmentId: string, studentId: string) {
  if (assignmentId !== canonicalDemoIds.diagnosticAssignmentId || !isKnownStudent(studentId)) return null;
  const evidence = responses.filter((response) => response.studentId === studentId && response.context === "diagnostic" && diagnosticItemIds.has(response.itemId)).flatMap((response) => {
    if (response.isCorrect) return [];
    const item = findDemoItem(response.itemId)!;
    const tag = item.distractorMap[response.answer];
    return tag ? [{ itemId: item.id, subskillId: canonicalDemoIds.commonDenominatorSubskillId, misconceptionTag: tag, selectedAnswer: response.answer }] : [];
  });
  if (!evidence.length) return { error: "Submit a diagnostic answer that identifies a supported misconception before completing." as const };
  const diagnosis = await fallbackAiAdapter.diagnoseExplanation({ studentId, assignmentId, gradeBand: "6–8", targetSubskillId: canonicalDemoIds.commonDenominatorSubskillId, supportedMisconceptionTags: evidence.map((entry) => entry.misconceptionTag), evidence, promptVersion: "diagnosis-v1" });
  const session = getOrCreatePracticeSession(studentId);
  return {
    diagnosis: { selectedSubskillId: canonicalDemoIds.commonDenominatorSubskillId, misconceptionTag: diagnosis.misconceptionTag, evidence, observation: diagnosis.observation, explanation: diagnosis.explanation, nextStep: diagnosis.nextStep, explanationSource: diagnosis.source },
    masterySnapshot: canonicalDemoSubskillIds.map((subskillId): { subskillId: string; level: MasteryLevel; evidenceCount: number } => ({ subskillId, level: subskillId === canonicalDemoIds.commonDenominatorSubskillId ? "needs_support" : "not_started", evidenceCount: subskillId === canonicalDemoIds.commonDenominatorSubskillId ? evidence.length : 0 })),
    practiceSession: { id: session.id, status: "active" as const, firstItemId: session.entries[0].itemId, itemCount: session.entries.length }
  };
}

export function getLocalPracticeSession(sessionId: string, studentId?: string) {
  // Route handlers may execute in separate module contexts during local development.
  // Reconstruct the canonical seeded session from its stable ID until Supabase owns this state.
  const session = sessions.get(sessionId) ?? (studentId && sessionId === sessionIdFor(studentId) ? getOrCreatePracticeSession(studentId) : undefined);
  if (!session || (studentId && session.studentId !== studentId)) return null;
  const items = session.entries.map((entry) => {
    const item = findDemoItem(entry.itemId)!;
    const unlock = peerUnlocks.get(peerKey(session.studentId, entry.itemId)) ?? { approach: false, fullSolution: false };
    return { itemId: item.id, subskillId: item.subskillId, prompt: item.prompt, difficulty: 1, position: entry.position, status: entry.status, isResurfaced: entry.isResurfaced, peerGate: { approachUnlocked: unlock.approach, fullSolutionUnlocked: unlock.fullSolution } };
  });
  const completedItemCount = session.entries.filter((entry) => entry.status === "correct").length;
  const current = session.entries.find((entry) => entry.status === "active" || entry.status === "pending" || entry.status === "requeued") ?? null;
  return { session: { id: session.id, studentId: session.studentId, status: current ? "active" as const : "complete" as const, currentItemId: current?.itemId ?? null }, items, progress: { completedItemCount, totalItemCount: session.entries.length } };
}

export async function submitLocalPeerAttempt(input: { studentId: string; itemId: string; attemptText: string; explanation: string }) {
  if (!isKnownStudent(input.studentId)) return null;
  const item = demoItems.find((candidate) => candidate.id === input.itemId);
  if (!item) return null;
  const normalizedAttemptText = input.attemptText.trim().replace(/\s+/g, " ");
  const hasMeaningfulLength = normalizedAttemptText.length >= 8 && input.explanation.trim().length >= 12;
  const hasItemNumber = [...item.prompt.matchAll(/\d+/g)].some(([value]) => normalizedAttemptText.includes(value));
  if (!hasMeaningfulLength || !hasItemNumber) return { attemptSubmissionId: `attempt-${Date.now()}`, verification: { status: "retry" as const, onTopic: false, nonTrivial: false, reason: "Show a math step using numbers from this problem, then explain what you tried.", source: "deterministic" as const }, unlocks: { approachUnlocked: false, fullSolutionUnlocked: false }, retryMessage: "Try writing one fraction-rewriting step and why you chose it." };
  const verification = await fallbackAiAdapter.verifyAttempt({ studentId: input.studentId, item: safeItem(item), attemptText: input.attemptText, explanation: input.explanation, normalizedAttemptText, promptVersion: "attempt-v1" });
  // In demo mode, a model-fallback result cannot stall the rehearsed peer-gate beat once deterministic checks pass.
  const demoFallbackAllowed = process.env.DEMO_MODE !== "false" && verification.source === "fallback";
  const verified = (verification.onTopic && verification.nonTrivial) || demoFallbackAllowed;
  const fullSolution = responses.some((response) => response.studentId === input.studentId && response.itemId === input.itemId && response.isCorrect);
  peerUnlocks.set(peerKey(input.studentId, input.itemId), { approach: verified, fullSolution });
  return { attemptSubmissionId: `attempt-${Date.now()}`, verification: { status: verified ? "verified" as const : "retry" as const, onTopic: verified, nonTrivial: verified, reason: verified && demoFallbackAllowed ? "Your attempt shows a relevant next step." : verification.reason, source: verification.source }, unlocks: { approachUnlocked: verified, fullSolutionUnlocked: fullSolution }, retryMessage: verified ? null : "Try describing the next math step you would take." };
}

export function getLocalPeerSolution(studentId: string, itemId: string) {
  if (!isKnownStudent(studentId) || !demoItems.some((item) => item.id === itemId)) return null;
  const unlock = peerUnlocks.get(peerKey(studentId, itemId)) ?? { approach: false, fullSolution: false };
  if (!unlock.approach) return { itemId, access: "locked" as const, message: "Show a meaningful attempt to see a peer’s approach." };
  const peerSolution = { authorAlias: "Jordan", approachText: "I rewrote both fractions so they had the same denominator before combining the numerators." };
  if (!unlock.fullSolution) return { itemId, access: "approach" as const, peerSolution, message: "Solve the item correctly to see the complete worked solution." };
  return { itemId, access: "full_solution" as const, peerSolution: { ...peerSolution, fullSolution: "1/3 is 4/12 and 1/4 is 3/12, so 4/12 + 3/12 = 7/12." } };
}

function getOrCreatePracticeSession(studentId: string) {
  const id = sessionIdFor(studentId);
  const existing = sessions.get(id);
  if (existing) return existing;
  const created = { id, studentId, entries: practiceItemIds.map((itemId, index) => ({ itemId, position: index + 1, status: index === 0 ? "active" as PracticeStatus : "pending" as PracticeStatus, isResurfaced: false })) };
  sessions.set(id, created);
  return created;
}

function updatePracticeEntry(studentId: string, itemId: string, isCorrect: boolean, requestedSessionId?: string) {
  const session = sessions.get(requestedSessionId ?? sessionIdFor(studentId));
  const entry = session?.entries.find((candidate) => candidate.itemId === itemId && candidate.status === "active");
  if (!session || !entry) return;
  entry.status = isCorrect ? "correct" : "missed";
  if (!isCorrect && !entry.isResurfaced) session.entries.push({ itemId, position: session.entries.length + 1, status: "requeued", isResurfaced: true });
  const next = session.entries.find((candidate) => candidate.status === "pending" || candidate.status === "requeued");
  if (next) next.status = "active";
}

function safeItem(item: Item) { return { id: item.id, subskillId: item.subskillId, gradeBand: "6–8", prompt: item.prompt, difficulty: 1 }; }
