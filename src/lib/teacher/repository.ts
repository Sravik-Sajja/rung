import { createClient } from "@supabase/supabase-js";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { getLocalDemoParticipants } from "@/lib/demo/participant";
import { getDemoStudentMastery, getDemoStudentResponseEvidence } from "@/lib/student/demo-learning-store";
import { describeAcceptedAnswer } from "@/lib/math/scoring";
import type { AnswerSpec, ItemVisualSpec, TeacherAttemptEvidence, TeacherStudentEvidence } from "@/lib/types";
import { getDemoTeacherDashboard, getDemoTeacherGroup, getDemoTeacherGroupPlan, groupStudentsByNeed } from "@/lib/teacher/grouping";
import { normalizeHeatmapRows, type HeatmapQueryRow } from "@/lib/teacher/heatmap";

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

type DurableEvidenceItem = {
  subskill_id: string;
  prompt: string;
  answer_spec?: AnswerSpec | null;
  visual_spec?: ItemVisualSpec | null;
};

type DurableEvidenceRow = {
  id: string;
  item_id: string;
  answer_raw: string;
  is_correct: boolean;
  context: string;
  submitted_at: string;
  diagnostic_session_id?: string | null;
  practice_session_id?: string | null;
  items: DurableEvidenceItem | DurableEvidenceItem[] | null;
};

type ClassResponseScope = { diagnosticSessionIds: Set<string>; practiceSessionIds: Set<string> };

/**
 * The response rows that belong to one class.
 *
 * A learner can sit in the public walkthrough and a teacher's class at the same
 * time, and `student_responses` carries no class of its own: an answer reaches a
 * class only through the diagnostic session that owns it, or through the
 * practice session that diagnostic generated. Without this scoping a teacher
 * sees answers their class never assigned.
 */
async function classResponseScope(
  client: NonNullable<ReturnType<typeof configuredClient>>,
  classId: string,
  studentIds: readonly string[],
): Promise<ClassResponseScope> {
  const empty: ClassResponseScope = { diagnosticSessionIds: new Set(), practiceSessionIds: new Set() };
  const { data: assignments, error: assignmentError } = await client.from("assignments").select("id").eq("class_id", classId);
  if (assignmentError) throw new Error(`Could not scope teacher evidence: ${assignmentError.message}`);
  const assignmentIds = ((assignments ?? []) as Array<{ id: string }>).map((assignment) => assignment.id);
  if (!assignmentIds.length) return empty;
  const { data: diagnostics, error: diagnosticError } = await client
    .from("diagnostic_sessions").select("id").in("assignment_id", assignmentIds).in("student_id", [...studentIds]);
  if (diagnosticError) throw new Error(`Could not scope teacher evidence: ${diagnosticError.message}`);
  const diagnosticSessionIds = new Set(((diagnostics ?? []) as Array<{ id: string }>).map((session) => session.id));
  if (!diagnosticSessionIds.size) return empty;
  const { data: practices, error: practiceError } = await client
    .from("practice_sessions").select("id").in("diagnostic_session_id", [...diagnosticSessionIds]);
  if (practiceError) throw new Error(`Could not scope teacher evidence: ${practiceError.message}`);
  return { diagnosticSessionIds, practiceSessionIds: new Set(((practices ?? []) as Array<{ id: string }>).map((session) => session.id)) };
}

function isInClassScope(row: DurableEvidenceRow, scope: ClassResponseScope) {
  if (row.diagnostic_session_id) return scope.diagnosticSessionIds.has(row.diagnostic_session_id);
  if (row.practice_session_id) return scope.practiceSessionIds.has(row.practice_session_id);
  // An answer with no session lineage cannot be attributed to this class.
  return false;
}

const EVIDENCE_ITEM_COLUMNS = "items!inner(subskill_id, prompt, answer_spec, visual_spec)";

function teacherEvidenceBySubskill(attempts: readonly (TeacherAttemptEvidence & { subskillId: string })[]): TeacherStudentEvidence["attemptsBySubskill"] {
  const grouped: TeacherStudentEvidence["attemptsBySubskill"] = {};
  for (const attempt of attempts) {
    const { subskillId, ...safeAttempt } = attempt;
    (grouped[subskillId] ??= []).push(safeAttempt);
  }
  return grouped;
}

/**
 * Returns only teacher-reviewable answer evidence for one student. The
 * function intentionally does not expose answer specifications, distractor
 * maps, AI diagnosis text, learner work-help submissions, or peer content.
 */
export async function getTeacherStudentEvidence(studentId: string): Promise<TeacherStudentEvidence> {
  const client = configuredClient();
  if (!client) {
    return { studentId, attemptsBySubskill: teacherEvidenceBySubskill(getDemoStudentResponseEvidence(studentId)) };
  }

  const { data, error } = await client
    .from("student_responses")
    .select(`id, item_id, answer_raw, is_correct, context, submitted_at, ${EVIDENCE_ITEM_COLUMNS}`)
    .eq("student_id", studentId)
    .in("context", ["diagnostic", "practice"])
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`Could not load teacher student evidence: ${error.message}`);

  const attempts = ((data ?? []) as DurableEvidenceRow[]).flatMap((row) => {
    const item = Array.isArray(row.items) ? row.items[0] : row.items;
    if (!item || (row.context !== "diagnostic" && row.context !== "practice")) return [];
    return [{
      id: row.id,
      itemId: row.item_id,
      prompt: item.prompt,
      ...(item.visual_spec ? { visualSpec: item.visual_spec } : {}),
      answerRaw: row.answer_raw,
      correctAnswer: describeAcceptedAnswer({ prompt: item.prompt, answerSpec: item.answer_spec }),
      isCorrect: row.is_correct,
      context: row.context,
      submittedAt: row.submitted_at,
      subskillId: item.subskill_id,
    } satisfies TeacherAttemptEvidence & { subskillId: string }];
  });
  return { studentId, attemptsBySubskill: teacherEvidenceBySubskill(attempts) };
}

/**
 * Shared by the sample class dashboard and by a teacher workspace roster.
 * `classId` is required: it is the only thing keeping a learner's work in
 * another class — including the public walkthrough — out of this teacher's view.
 */
export async function getTeacherEvidenceByStudentIds(studentIds: readonly string[], classId: string): Promise<Record<string, TeacherStudentEvidence["attemptsBySubskill"]>> {
  const uniqueStudentIds = [...new Set(studentIds)];
  if (!uniqueStudentIds.length) return {};
  const client = configuredClient();
  if (!client) {
    return Object.fromEntries(uniqueStudentIds.map((studentId) => [
      studentId,
      teacherEvidenceBySubskill(getDemoStudentResponseEvidence(studentId)),
    ]));
  }
  const scope = await classResponseScope(client, classId, uniqueStudentIds);
  const { data, error } = await client
    .from("student_responses")
    .select(`id, student_id, item_id, answer_raw, is_correct, context, submitted_at, diagnostic_session_id, practice_session_id, ${EVIDENCE_ITEM_COLUMNS}`)
    .in("student_id", uniqueStudentIds)
    .in("context", ["diagnostic", "practice"])
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`Could not load teacher response evidence: ${error.message}`);
  const grouped = Object.fromEntries(uniqueStudentIds.map((studentId) => [studentId, {} as TeacherStudentEvidence["attemptsBySubskill"]]));
  for (const raw of (data ?? []) as Array<DurableEvidenceRow & { student_id: string }>) {
    const item = Array.isArray(raw.items) ? raw.items[0] : raw.items;
    if (!item || (raw.context !== "diagnostic" && raw.context !== "practice")) continue;
    if (!isInClassScope(raw, scope)) continue;
    const bySkill = grouped[raw.student_id];
    if (!bySkill) continue; // defense in depth: never project another student's evidence.
    (bySkill[item.subskill_id] ??= []).push({
      id: raw.id, itemId: raw.item_id, prompt: item.prompt,
      ...(item.visual_spec ? { visualSpec: item.visual_spec } : {}),
      answerRaw: raw.answer_raw,
      correctAnswer: describeAcceptedAnswer({ prompt: item.prompt, answerSpec: item.answer_spec }),
      isCorrect: raw.is_correct,
      context: raw.context, submittedAt: raw.submitted_at,
    });
  }
  return grouped;
}

/**
 * In the local no-Supabase walkthrough, temporary learners live in the
 * server-only demo participant store. The production/durable path needs no
 * special merge: the migration inserts student, enrollment, and mastery rows
 * that class_mastery_heatmap reads normally.
 */
function getLocalTeacherDashboardWithParticipants() {
  const base = getDemoTeacherDashboard();
  if (!base) return null;
  const participants = getLocalDemoParticipants();
  if (!participants.length) {
    return {
      ...base,
      responseEvidenceByStudent: Object.fromEntries(base.students.map((student) => [
        student.id,
        teacherEvidenceBySubskill(getDemoStudentResponseEvidence(student.id)),
      ])),
    };
  }

  const participantStudents = participants.map((participant) => ({
    id: participant.studentId,
    displayName: participant.displayName,
    gradeBand: participant.gradeBand,
  }));
  const participantCells = participants.flatMap((participant) =>
    getDemoStudentMastery(participant.studentId).map((skill) => ({
      studentId: participant.studentId,
      subskillId: skill.subskillId,
      level: skill.level,
      evidenceSummary: skill.message,
    })),
  );
  const cells = [...base.cells, ...participantCells];
  return {
    ...base,
    students: [...base.students, ...participantStudents],
    cells,
    groups: groupStudentsByNeed(cells),
    responseEvidenceByStudent: Object.fromEntries([...base.students, ...participantStudents].map((student) => [
      student.id,
      teacherEvidenceBySubskill(getDemoStudentResponseEvidence(student.id)),
    ])),
  };
}

export async function getTeacherDashboard(classId: string = canonicalDemoIds.classId) {
  const client = configuredClient();
  if (!client) return getLocalTeacherDashboardWithParticipants();
  const { data: rows, error } = await client.from("class_mastery_heatmap").select("student_id, subskill_id, level, evidence_summary").eq("class_id", classId);
  // A configured database is authoritative. Falling back here would make an
  // outage look like a valid class with stale demo data, which is especially
  // misleading for a teacher reviewing a learner who just completed work.
  if (error) throw new Error(`Could not load teacher dashboard: ${error.message}`);
  if (!rows?.length) return null;
  const cells = normalizeHeatmapRows(rows as HeatmapQueryRow[]);
  const [{ data: students, error: studentsError }, { data: subskills, error: subskillsError }] = await Promise.all([
    client.from("students").select("id, display_name, grade_band").in("id", [...new Set(cells.map((cell) => cell.studentId))]),
    client.from("subskills").select("id, name").in("id", [...new Set(cells.map((cell) => cell.subskillId))]),
  ]);
  if (studentsError) throw new Error(`Could not load teacher dashboard students: ${studentsError.message}`);
  if (subskillsError) throw new Error(`Could not load teacher dashboard subskills: ${subskillsError.message}`);
  if (!students || !subskills) throw new Error("Could not load complete teacher dashboard data.");
  const dashboardStudents = students.map((student) => ({ id: student.id, displayName: student.display_name, gradeBand: student.grade_band }));
  return {
    classId,
    students: dashboardStudents,
    subskills: subskills.map((subskill) => ({ id: subskill.id, name: subskill.name })),
    cells,
    groups: groupStudentsByNeed(cells),
    // Scope the evidence query to the students already returned by this class
    // dashboard. It cannot introduce an answer from an unrelated student.
    responseEvidenceByStudent: await getTeacherEvidenceByStudentIds(dashboardStudents.map((student) => student.id), classId),
  };
}

export async function getTeacherGroupPlan(groupId: string) {
  const client = configuredClient();
  if (!client) {
    const group = getDemoTeacherGroup(groupId);
    const plan = getDemoTeacherGroupPlan(groupId);
    return group && plan ? { group, plan } : null;
  }
  const { data: group } = await client.from("teacher_groups").select("id, subskill_id, label").eq("id", groupId).maybeSingle();
  const { data: members } = await client.from("teacher_group_members").select("student_id").eq("teacher_group_id", groupId);
  const { data: plan } = await client.from("lesson_plans").select("content").eq("teacher_group_id", groupId).maybeSingle();
  if (!group || !members || !plan) return null;
  return { group: { id: group.id, subskillId: group.subskill_id, label: group.label, studentIds: members.map((member) => member.student_id) }, plan: plan.content };
}
