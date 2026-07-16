import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import {
  canonicalDemoIds,
  canonicalDemoStudents,
  canonicalDemoSubskillIds,
  canonicalDiagnosticItemIds,
  canonicalTeacherGroupIds,
  canonicalTeacherPracticeItemIds,
  masteryLevels,
} from "../src/lib/demo/contracts";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.");
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const { classId, teacherName, fractionsTopicId, commonDenominatorSubskillId, diagnosticAssignmentId } = canonicalDemoIds;

const students = canonicalDemoStudents.map((student) => ({
  id: student.id,
  display_name: student.displayName,
  grade_band: "6-8",
  is_demo_default: student.id === canonicalDemoIds.mayaStudentId,
}));

const subskills = [
  { id: "equivalent-fractions", topic_id: fractionsTopicId, slug: "equivalent-fractions", name: "Equivalent fractions", description: "Recognize and generate equivalent fractions.", prerequisite_subskill_id: null },
  { id: "fraction-number-line", topic_id: fractionsTopicId, slug: "fraction-number-line", name: "Fractions on a number line", description: "Locate fractions on a number line.", prerequisite_subskill_id: "equivalent-fractions" },
  { id: commonDenominatorSubskillId, topic_id: fractionsTopicId, slug: commonDenominatorSubskillId, name: "Find a common denominator", description: "Rewrite fractions with a shared denominator.", prerequisite_subskill_id: "equivalent-fractions" },
  { id: "add-unlike-denominators", topic_id: fractionsTopicId, slug: "add-unlike-denominators", name: "Add fractions with unlike denominators", description: "Add fractions after finding a common denominator.", prerequisite_subskill_id: commonDenominatorSubskillId },
  { id: "subtract-unlike-denominators", topic_id: fractionsTopicId, slug: "subtract-unlike-denominators", name: "Subtract fractions after finding a common denominator.", description: "Subtract fractions after finding a common denominator.", prerequisite_subskill_id: commonDenominatorSubskillId },
] as const;

const items = [
  { id: "equivalent-1", subskill_id: "equivalent-fractions", item_type: "practice", prompt: "Write a fraction equivalent to 1/2 with denominator 8.", answer_spec: { accepted: ["4/8"] }, solution_steps: ["Multiply the numerator and denominator by the same number."], difficulty: 1, is_active: true, distractor_map: { "1/8": "changes_denominator_only" } },
  { id: "number-line-1", subskill_id: "fraction-number-line", item_type: "practice", prompt: "Which point is 3/4 of the way from 0 to 1?", answer_spec: { accepted: ["3/4"] }, solution_steps: ["Split the line into four equal parts and count three parts from zero."], difficulty: 1, is_active: true, distractor_map: { "1/3": "reverses_numerator_and_denominator" } },
  { id: "common-denominator-1", subskill_id: commonDenominatorSubskillId, item_type: "practice", prompt: "What common denominator can you use for 1/3 and 1/4?", answer_spec: { accepted: ["12"] }, solution_steps: ["Use a number both 3 and 4 divide into evenly."], difficulty: 1, is_active: true, distractor_map: { "7": "adds_denominators" } },
  { id: "common-denominator-2", subskill_id: commonDenominatorSubskillId, item_type: "practice", prompt: "What common denominator can you use for 2/5 and 1/3?", answer_spec: { accepted: ["15"] }, solution_steps: ["Use a number both 5 and 3 divide into evenly."], difficulty: 2, is_active: true, distractor_map: { "8": "adds_denominators" } },
  { id: "add-unlike-1", subskill_id: "add-unlike-denominators", item_type: "practice", prompt: "What is 1/3 + 1/4?", answer_spec: { accepted: ["7/12"] }, solution_steps: ["Find a common denominator of 12.", "Rewrite the fractions as twelfths, then add."], difficulty: 1, is_active: true, distractor_map: { "2/7": "adds_numerators_and_denominators" } },
  { id: "add-unlike-2", subskill_id: "add-unlike-denominators", item_type: "practice", prompt: "What is 2/5 + 1/3?", answer_spec: { accepted: ["11/15"] }, solution_steps: ["Find a common denominator of 15.", "Rewrite the fractions as fifteenths, then add."], difficulty: 2, is_active: true, distractor_map: { "3/8": "adds_numerators_and_denominators" } },
  { id: "subtract-unlike-1", subskill_id: "subtract-unlike-denominators", item_type: "practice", prompt: "What is 3/4 - 1/3?", answer_spec: { accepted: ["5/12"] }, solution_steps: ["Rewrite both fractions in twelfths before subtracting."], difficulty: 1, is_active: true, distractor_map: { "2/1": "subtracts_numerators_and_denominators" } },
] as const;

const levelSummary: Record<typeof masteryLevels[number], string> = {
  not_started: "No responses yet.",
  needs_support: "Diagnostic evidence shows a gap.",
  developing: "One supported correct response.",
  mastered: "Two correct target-level responses.",
};

// Rows correspond to canonicalDemoSubskillIds. This is the canonical complete 8 x 5 matrix.
const masteryLevelsByStudent: Record<string, Array<typeof masteryLevels[number]>> = {
  "maya-chen": ["developing", "mastered", "needs_support", "needs_support", "not_started"],
  "diego-alvarez": ["needs_support", "developing", "needs_support", "developing", "not_started"],
  "zara-williams": ["developing", "mastered", "needs_support", "needs_support", "developing"],
  "noah-brooks": ["mastered", "developing", "developing", "developing", "developing"],
  "ava-patel": ["developing", "needs_support", "developing", "mastered", "needs_support"],
  "leo-martin": ["needs_support", "developing", "mastered", "not_started", "not_started"],
  "sofia-nguyen": ["mastered", "mastered", "mastered", "developing", "developing"],
  "ethan-williams": ["needs_support", "needs_support", "developing", "needs_support", "not_started"],
};

const groupPlans = [
  { id: canonicalTeacherGroupIds[0], subskillId: canonicalDemoSubskillIds[0], objective: "Create and recognize equivalent fractions using visual and numerical models.", durationMinutes: 15, materials: ["Fraction strips", "Whiteboards"], practiceItemIds: [canonicalTeacherPracticeItemIds[0]], videoTitle: "Equivalent fractions with visual models" },
  { id: canonicalTeacherGroupIds[1], subskillId: canonicalDemoSubskillIds[1], objective: "Locate benchmark fractions accurately on a number line.", durationMinutes: 15, materials: ["Number-line strips", "Pencils"], practiceItemIds: [canonicalTeacherPracticeItemIds[1]], videoTitle: "Fractions on a number line" },
  { id: canonicalTeacherGroupIds[2], subskillId: canonicalDemoSubskillIds[2], objective: "Find a shared denominator before combining fractions with unlike denominators.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards", "Practice cards"], practiceItemIds: [canonicalTeacherPracticeItemIds[2], canonicalTeacherPracticeItemIds[3]], videoTitle: "Adding fractions with unlike denominators" },
  { id: canonicalTeacherGroupIds[3], subskillId: canonicalDemoSubskillIds[3], objective: "Add fractions with unlike denominators by renaming each fraction first.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], practiceItemIds: [canonicalTeacherPracticeItemIds[2], canonicalTeacherPracticeItemIds[3]], videoTitle: "Adding fractions with unlike denominators" },
  { id: canonicalTeacherGroupIds[4], subskillId: canonicalDemoSubskillIds[4], objective: "Subtract fractions with unlike denominators after renaming each fraction.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], practiceItemIds: [canonicalTeacherPracticeItemIds[2], canonicalTeacherPracticeItemIds[4]], videoTitle: "Subtracting fractions with unlike denominators" },
] as const;

async function assertNoError<T>({ error, data }: { error: { message: string } | null; data: T }) {
  if (error) throw new Error(error.message);
  return data;
}

async function seed() {
  await assertNoError(await supabase.from("topics").upsert({ id: fractionsTopicId, slug: "fractions-rational-operations", name: "Fractions and rational-number operations" }));
  await assertNoError(await supabase.from("subskills").upsert(subskills.filter((subskill) => subskill.prerequisite_subskill_id === null)));
  await assertNoError(await supabase.from("subskills").upsert(subskills.filter((subskill) => subskill.prerequisite_subskill_id !== null)));
  await assertNoError(await supabase.from("students").upsert(students));
  await assertNoError(await supabase.from("classes").upsert({ id: classId, name: "Ms. Rivera's fractions class", teacher_display_name: teacherName }));
  await assertNoError(await supabase.from("class_enrollments").delete().eq("class_id", classId));
  await assertNoError(await supabase.from("class_enrollments").upsert(students.map((student) => ({ class_id: classId, student_id: student.id }))));
  await assertNoError(await supabase.from("items").upsert(items));
  await assertNoError(await supabase.from("assignments").upsert({ id: diagnosticAssignmentId, class_id: classId, topic_id: fractionsTopicId, title: "Fractions check-in", mode: "diagnostic" }));
  await assertNoError(await supabase.from("assignment_items").delete().eq("assignment_id", diagnosticAssignmentId));
  await assertNoError(await supabase.from("assignment_items").upsert(canonicalDiagnosticItemIds.map((itemId, index) => ({ assignment_id: diagnosticAssignmentId, item_id: itemId, position: index + 1 }))));

  const studentIds = students.map((student) => student.id);
  const groups = await assertNoError(await supabase.from("teacher_groups").select("id").eq("class_id", classId));
  const groupIds = groups.map((group) => group.id);
  if (groupIds.length) {
    await assertNoError(await supabase.from("lesson_plans").delete().in("teacher_group_id", groupIds));
    await assertNoError(await supabase.from("teacher_group_members").delete().in("teacher_group_id", groupIds));
    await assertNoError(await supabase.from("teacher_groups").delete().eq("class_id", classId));
  }

  const sessions = await assertNoError(await supabase.from("practice_sessions").select("id").in("student_id", studentIds));
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length) {
    await assertNoError(await supabase.from("practice_session_items").delete().in("practice_session_id", sessionIds));
    await assertNoError(await supabase.from("practice_sessions").delete().in("id", sessionIds));
  }
  await assertNoError(await supabase.from("student_responses").delete().in("student_id", studentIds));
  await assertNoError(await supabase.from("attempt_submissions").delete().in("student_id", studentIds));
  await assertNoError(await supabase.from("peer_unlocks").delete().in("student_id", studentIds));
  await assertNoError(await supabase.from("mastery").delete().in("student_id", studentIds));

  const masteryRows = students.flatMap((student) => canonicalDemoSubskillIds.map((subskillId, index) => {
    const level = masteryLevelsByStudent[student.id][index];
    return { student_id: student.id, subskill_id: subskillId, level, evidence_count: level === "mastered" ? 2 : level === "not_started" ? 0 : 1, evidence_summary: levelSummary[level] };
  }));
  await assertNoError(await supabase.from("mastery").insert(masteryRows));

  const teacherGroups = groupPlans.map((plan) => ({ id: plan.id, class_id: classId, subskill_id: plan.subskillId, label: `Support: ${plan.objective.split(" ").slice(0, 5).join(" ")}` }));
  await assertNoError(await supabase.from("teacher_groups").upsert(teacherGroups));
  const groupMembers = groupPlans.flatMap((plan) => students
    .filter((student) => masteryLevelsByStudent[student.id][canonicalDemoSubskillIds.indexOf(plan.subskillId)] === "needs_support")
    .map((student) => ({ teacher_group_id: plan.id, student_id: student.id })));
  await assertNoError(await supabase.from("teacher_group_members").upsert(groupMembers));
  await assertNoError(await supabase.from("lesson_plans").upsert(groupPlans.map((plan) => ({
    id: `${plan.id}-plan`, teacher_group_id: plan.id, prompt_version: "seed-v1", status: "cached",
    content: { objective: plan.objective, durationMinutes: plan.durationMinutes, materials: plan.materials, practiceItemIds: plan.practiceItemIds, checkForUnderstanding: "Students explain their strategy before sharing an answer." },
  }))));
  await assertNoError(await supabase.from("video_recommendations").upsert(groupPlans.map((plan) => {
    const isPrimaryCommonDenominatorPlan = plan.subskillId === commonDenominatorSubskillId;
    return {
      id: `${plan.subskillId}-video`,
      subskill_id: plan.subskillId,
      title: plan.videoTitle,
      provider: isPrimaryCommonDenominatorPlan ? "Khan Academy" : "Rung reviewed resource",
      url: isPrimaryCommonDenominatorPlan
        ? "https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3/imp-adding-and-subtracting-fractions-with-unlike-denominators/v/adding-small-fractions-with-unlike-denominators"
        : "#",
      verification_note: isPrimaryCommonDenominatorPlan
        ? "Reviewed: it explicitly teaches finding a common denominator, rewriting equivalent fractions, then adding; it fits the primary Maya/common-denominator group."
        : "Placeholder; replace with a manually reviewed video before rehearsal.",
      is_active: true,
    };
  })));

  console.log(`Seeded ${students.length} students, ${subskills.length} sub-skills, ${masteryRows.length} mastery records, and ${teacherGroups.length} cached group plans for ${classId}.`);
}

seed().catch((error: unknown) => {
  console.error("Rung seed failed:", error);
  process.exitCode = 1;
});
