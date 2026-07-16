import { createClient } from "@supabase/supabase-js";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import { getLocalDemoParticipants } from "@/lib/demo/participant";
import { getDemoStudentMastery } from "@/lib/student/demo-learning-store";
import { getDemoTeacherDashboard, getDemoTeacherGroup, getDemoTeacherGroupPlan, groupStudentsByNeed } from "@/lib/teacher/grouping";
import { normalizeHeatmapRows, type HeatmapQueryRow } from "@/lib/teacher/heatmap";

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
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
  if (!participants.length) return base;

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
  };
}

export async function getTeacherDashboard(classId: string = canonicalDemoIds.classId) {
  const client = configuredClient();
  if (!client) return getLocalTeacherDashboardWithParticipants();
  const { data: rows, error } = await client.from("class_mastery_heatmap").select("student_id, subskill_id, level, evidence_summary").eq("class_id", classId);
  if (error || !rows?.length) return getLocalTeacherDashboardWithParticipants();
  const cells = normalizeHeatmapRows(rows as HeatmapQueryRow[]);
  const [{ data: students }, { data: subskills }] = await Promise.all([
    client.from("students").select("id, display_name, grade_band").in("id", [...new Set(cells.map((cell) => cell.studentId))]),
    client.from("subskills").select("id, name").in("id", [...new Set(cells.map((cell) => cell.subskillId))]),
  ]);
  if (!students || !subskills) return getLocalTeacherDashboardWithParticipants();
  return {
    classId,
    students: students.map((student) => ({ id: student.id, displayName: student.display_name, gradeBand: student.grade_band })),
    subskills: subskills.map((subskill) => ({ id: subskill.id, name: subskill.name })),
    cells,
    groups: groupStudentsByNeed(cells),
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
