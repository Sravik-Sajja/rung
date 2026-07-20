// Answer-safe read path over a student's completed diagnostic and practice work (WS1a).
//
// Answer safety: a response may only be shown once it is already scored, and — for diagnostic
// responses specifically — only once the diagnosis has been generated. Demo evidence records only
// ever exist post-submission, so they are inherently scored; the diagnostic-completion and
// practice-resolution filters below are what additionally hide an in-flight diagnostic or an
// unfinished practice run. Both `getDemoStudentWork` and `getPersistedStudentWork` apply their
// completion filter BEFORE any item is added to a session, so no caller of this module can ever
// see an answer key for work that has not finished.
import { createClient } from "@supabase/supabase-js";
import { demoSubskills } from "@/lib/demo-data";
import { describeAcceptedAnswer } from "@/lib/math/scoring";
import { getDemoStudentResponseEvidence, getDemoStudentWorkSessions } from "@/lib/student/demo-learning-store";
import type { AnswerSpec, ItemVisualSpec } from "@/lib/types";

export type StudentWorkItem = {
  itemId: string;
  prompt: string;
  visualSpec?: ItemVisualSpec;
  answerRaw: string;
  correctAnswer: string;
  isCorrect: boolean;
  submittedAt: string;
  subskillId: string;
  subskillTitle: string;
  /** 1-based attempt index for this item within this session. A retried item has more than one. */
  attempt?: number;
};

export type StudentWorkSession = {
  kind: "diagnostic" | "practice";
  sessionId: string;
  planTitle?: string;
  subskillId?: string;
  completedAt: string;
  items: StudentWorkItem[];
  firstTryCount: number;
  totalCount: number;
};

const demoSubskillTitleById = new Map(demoSubskills.map((skill) => [skill.id, skill.name]));

// --- Demo -----------------------------------------------------------------

/**
 * Demo mode: session identity and item ordering come from the session store
 * (`getDemoStudentWorkSessions`); answers and correctness come from the separate evidence log
 * (`getDemoStudentResponseEvidence`), joined by item id + context (demo evidence carries no session
 * id — see the module doc on `demo-learning-store.ts`'s `LocalResponseEvidence`).
 *
 * Known demo-only limitation: if a student somehow has two sessions of the same kind that reuse an
 * item id (for example, two separate diagnostic attempts — the diagnostic always fills its five
 * fixed slot ids), the same evidence attempt can surface under both sessions, because there is no
 * session id to disambiguate. This does not happen in the normal one-diagnostic, plan-per-subskill
 * demo flow, and persisted mode does not share this limitation (it has real session ids).
 */
export function getDemoStudentWork(studentId: string): StudentWorkSession[] {
  const sessions = getDemoStudentWorkSessions(studentId).filter((session) => session.complete && session.itemIds.length > 0);
  const evidenceOldestFirst = [...getDemoStudentResponseEvidence(studentId)].reverse();

  const grouped = sessions.map((session): StudentWorkSession => {
    const items: StudentWorkItem[] = [];
    let firstTryCount = 0;
    for (const itemId of session.itemIds) {
      const attempts = evidenceOldestFirst.filter((record) => record.itemId === itemId && record.context === session.kind);
      attempts.forEach((attempt, index) => {
        items.push({
          itemId: attempt.itemId,
          prompt: attempt.prompt,
          ...(attempt.visualSpec ? { visualSpec: attempt.visualSpec } : {}),
          answerRaw: attempt.answerRaw,
          correctAnswer: attempt.correctAnswer,
          isCorrect: attempt.isCorrect,
          submittedAt: attempt.submittedAt,
          subskillId: attempt.subskillId,
          subskillTitle: demoSubskillTitleById.get(attempt.subskillId) ?? attempt.subskillId,
          attempt: index + 1,
        });
      });
      if (attempts.length > 0 && attempts[0]!.isCorrect) firstTryCount += 1;
    }
    const completedAt = items.reduce((latest, item) => (item.submittedAt > latest ? item.submittedAt : latest), items[0]?.submittedAt ?? "");
    return {
      kind: session.kind,
      sessionId: session.sessionId,
      planTitle: session.planTitle,
      subskillId: session.subskillId,
      completedAt,
      items,
      firstTryCount,
      totalCount: session.itemIds.length,
    };
  });

  return grouped
    .filter((session) => session.items.length > 0)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
}

// --- Persisted (Supabase) ---------------------------------------------------------------------

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

type PersistedResponseRow = {
  item_id: string;
  answer_raw: string;
  is_correct: boolean;
  submitted_at: string;
  items: { id: string; subskill_id: string; prompt: string; answer_spec: AnswerSpec; visual_spec: ItemVisualSpec | null } | null;
};

/** Groups oldest-first response rows by item id and maps them into answer-safe DTO items. */
function itemsToWorkItems(rows: readonly PersistedResponseRow[], subskillTitleById: ReadonlyMap<string, string>): { items: StudentWorkItem[]; firstTryCount: number } {
  const byItem = new Map<string, PersistedResponseRow[]>();
  for (const row of rows) {
    if (!row.items) continue;
    const list = byItem.get(row.item_id) ?? [];
    list.push(row);
    byItem.set(row.item_id, list);
  }
  const items: StudentWorkItem[] = [];
  let firstTryCount = 0;
  for (const attempts of byItem.values()) {
    attempts.forEach((row, index) => {
      const item = row.items!;
      items.push({
        itemId: item.id,
        prompt: item.prompt,
        ...(item.visual_spec ? { visualSpec: item.visual_spec } : {}),
        answerRaw: row.answer_raw,
        correctAnswer: describeAcceptedAnswer({ prompt: item.prompt, answerSpec: item.answer_spec }),
        isCorrect: row.is_correct,
        submittedAt: row.submitted_at,
        subskillId: item.subskill_id,
        subskillTitle: subskillTitleById.get(item.subskill_id) ?? item.subskill_id,
        attempt: index + 1,
      });
    });
    if (attempts[0]!.is_correct) firstTryCount += 1;
  }
  return { items, firstTryCount };
}

/**
 * Persisted implementation of the same read path. `student_responses` is queried only for sessions
 * already known to be complete (`diagnostic_sessions.status = 'complete'` / `practice_sessions.status
 * = 'complete'`), which is the persisted equivalent of the demo completion filters above. Returns
 * `null` only when Supabase is not configured, mirroring `getPersistedStudentMastery`.
 */
export async function getPersistedStudentWork(input: { studentId: string }): Promise<StudentWorkSession[] | null> {
  const client = configuredClient();
  if (!client) return null;

  const [{ data: diagnosticSessions, error: diagnosticError }, { data: practiceSessions, error: practiceError }] = await Promise.all([
    client.from("diagnostic_sessions").select("id, completed_at").eq("student_id", input.studentId).eq("status", "complete"),
    client.from("practice_sessions").select("id, completed_at").eq("student_id", input.studentId).eq("status", "complete"),
  ]);
  if (diagnosticError) throw new Error(diagnosticError.message);
  if (practiceError) throw new Error(practiceError.message);

  const diagnosticSessionRows = (diagnosticSessions ?? []) as Array<{ id: string; completed_at: string | null }>;
  const practiceSessionRows = (practiceSessions ?? []) as Array<{ id: string; completed_at: string | null }>;
  if (!diagnosticSessionRows.length && !practiceSessionRows.length) return [];

  const [{ data: subskillRows, error: subskillError }, { data: planRows, error: planError }, diagnosticResponses, practiceResponses] = await Promise.all([
    client.from("subskills").select("id, name"),
    practiceSessionRows.length
      ? client.from("practice_plans").select("id, target_subskill_id, title").in("id", practiceSessionRows.map((row) => row.id))
      : Promise.resolve({ data: [], error: null }),
    diagnosticSessionRows.length
      ? client
          .from("student_responses")
          .select("item_id, answer_raw, is_correct, submitted_at, diagnostic_session_id, items(id, subskill_id, prompt, answer_spec, visual_spec)")
          .eq("student_id", input.studentId)
          .in("diagnostic_session_id", diagnosticSessionRows.map((row) => row.id))
          .order("submitted_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    practiceSessionRows.length
      ? client
          .from("student_responses")
          .select("item_id, answer_raw, is_correct, submitted_at, practice_session_id, items(id, subskill_id, prompt, answer_spec, visual_spec)")
          .eq("student_id", input.studentId)
          .in("practice_session_id", practiceSessionRows.map((row) => row.id))
          .order("submitted_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (subskillError) throw new Error(subskillError.message);
  if (planError) throw new Error(planError.message);
  if (diagnosticResponses.error) throw new Error(diagnosticResponses.error.message);
  if (practiceResponses.error) throw new Error(practiceResponses.error.message);

  const subskillTitleById = new Map(((subskillRows ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
  const planById = new Map(((planRows ?? []) as Array<{ id: string; target_subskill_id: string; title: string }>).map((row) => [row.id, row]));

  const diagnosticRowsBySession = new Map<string, PersistedResponseRow[]>();
  for (const row of (diagnosticResponses.data ?? []) as Array<PersistedResponseRow & { diagnostic_session_id: string }>) {
    const list = diagnosticRowsBySession.get(row.diagnostic_session_id) ?? [];
    list.push(row);
    diagnosticRowsBySession.set(row.diagnostic_session_id, list);
  }
  const practiceRowsBySession = new Map<string, PersistedResponseRow[]>();
  for (const row of (practiceResponses.data ?? []) as Array<PersistedResponseRow & { practice_session_id: string }>) {
    const list = practiceRowsBySession.get(row.practice_session_id) ?? [];
    list.push(row);
    practiceRowsBySession.set(row.practice_session_id, list);
  }

  const sessions: StudentWorkSession[] = [];
  for (const session of diagnosticSessionRows) {
    const rows = diagnosticRowsBySession.get(session.id) ?? [];
    if (!rows.length) continue;
    const { items, firstTryCount } = itemsToWorkItems(rows, subskillTitleById);
    if (!items.length) continue;
    const completedAt = session.completed_at ?? items.reduce((latest, item) => (item.submittedAt > latest ? item.submittedAt : latest), items[0]!.submittedAt);
    sessions.push({ kind: "diagnostic", sessionId: session.id, completedAt, items, firstTryCount, totalCount: new Set(items.map((item) => item.itemId)).size });
  }
  for (const session of practiceSessionRows) {
    const rows = practiceRowsBySession.get(session.id) ?? [];
    if (!rows.length) continue;
    const { items, firstTryCount } = itemsToWorkItems(rows, subskillTitleById);
    if (!items.length) continue;
    const plan = planById.get(session.id);
    const completedAt = session.completed_at ?? items.reduce((latest, item) => (item.submittedAt > latest ? item.submittedAt : latest), items[0]!.submittedAt);
    sessions.push({
      kind: "practice",
      sessionId: session.id,
      planTitle: plan?.title,
      subskillId: plan?.target_subskill_id,
      completedAt,
      items,
      firstTryCount,
      totalCount: new Set(items.map((item) => item.itemId)).size,
    });
  }

  return sessions.sort((left, right) => right.completedAt.localeCompare(left.completedAt));
}
