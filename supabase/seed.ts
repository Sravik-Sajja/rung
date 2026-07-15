import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { canonicalDemoIds, masteryLevels } from "../src/lib/demo/contracts";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.");
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const { classId, teacherName, fractionsTopicId, commonDenominatorSubskillId, mayaStudentId, diagnosticAssignmentId } = canonicalDemoIds;

const students = [
  { id: mayaStudentId, display_name: "Maya Chen", grade_band: "6-8", is_demo_default: true },
  { id: "diego-ramirez", display_name: "Diego Ramirez", grade_band: "6-8", is_demo_default: false },
  { id: "zara-bell", display_name: "Zara Bell", grade_band: "6-8", is_demo_default: false },
  { id: "noah-brooks", display_name: "Noah Brooks", grade_band: "6-8", is_demo_default: false },
  { id: "ava-patel", display_name: "Ava Patel", grade_band: "6-8", is_demo_default: false },
  { id: "leo-martin", display_name: "Leo Martin", grade_band: "6-8", is_demo_default: false },
  { id: "imani-johnson", display_name: "Imani Johnson", grade_band: "6-8", is_demo_default: false },
  { id: "owen-kim", display_name: "Owen Kim", grade_band: "6-8", is_demo_default: false },
] as const;

const subskills = [
  { id: "equivalent-fractions", topic_id: fractionsTopicId, slug: "equivalent-fractions", name: "Equivalent fractions", description: "Recognize and generate equivalent fractions.", prerequisite_subskill_id: null },
  { id: "fraction-number-line", topic_id: fractionsTopicId, slug: "fraction-number-line", name: "Fractions on a number line", description: "Locate fractions on a number line.", prerequisite_subskill_id: "equivalent-fractions" },
  { id: commonDenominatorSubskillId, topic_id: fractionsTopicId, slug: commonDenominatorSubskillId, name: "Find a common denominator", description: "Rewrite fractions with a shared denominator.", prerequisite_subskill_id: "equivalent-fractions" },
  { id: "add-unlike-denominators", topic_id: fractionsTopicId, slug: "add-unlike-denominators", name: "Add fractions with unlike denominators", description: "Add fractions after finding a common denominator.", prerequisite_subskill_id: commonDenominatorSubskillId },
  { id: "subtract-unlike-denominators", topic_id: fractionsTopicId, slug: "subtract-unlike-denominators", name: "Subtract fractions with unlike denominators", description: "Subtract fractions after finding a common denominator.", prerequisite_subskill_id: commonDenominatorSubskillId },
] as const;

const items = [
  {
    id: "diagnostic-add-unlike-1",
    subskill_id: "add-unlike-denominators",
    item_type: "diagnostic",
    prompt: "What is 1/3 + 1/4?",
    answer_spec: { accepted: ["7/12"] },
    solution_steps: ["Find a common denominator of 12.", "Rewrite 1/3 as 4/12 and 1/4 as 3/12.", "Add 4/12 and 3/12."],
    difficulty: 1,
    is_active: true,
    distractor_map: { "2/7": "adds_numerators_and_denominators" },
  },
  {
    id: "diagnostic-equivalent-1",
    subskill_id: "equivalent-fractions",
    item_type: "diagnostic",
    prompt: "Which fraction is equivalent to 1/2?",
    answer_spec: { accepted: ["2/4"] },
    solution_steps: ["Multiply the numerator and denominator by the same number."],
    difficulty: 1,
    is_active: true,
    distractor_map: { "1/4": "changes_only_denominator" },
  },
  {
    id: "practice-common-denominator-1",
    subskill_id: commonDenominatorSubskillId,
    item_type: "practice",
    prompt: "Rewrite 2/5 and 1/3 using a common denominator.",
    answer_spec: { accepted: ["6/15,5/15"] },
    solution_steps: ["Use 15 because it is a multiple of 5 and 3.", "Rewrite 2/5 as 6/15 and 1/3 as 5/15."],
    difficulty: 1,
    is_active: true,
    distractor_map: { "2/8": "adds_denominators" },
  },
] as const;

const masteryByStudent: Record<string, Array<{ subskill_id: string; level: typeof masteryLevels[number]; evidence_count: number; evidence_summary: string }>> = {
  "maya-chen": [
    { subskill_id: "equivalent-fractions", level: "developing", evidence_count: 1, evidence_summary: "Can identify some equivalent fractions with support." },
    { subskill_id: commonDenominatorSubskillId, level: "needs_support", evidence_count: 1, evidence_summary: "Added denominators directly instead of finding a common denominator." },
    { subskill_id: "add-unlike-denominators", level: "needs_support", evidence_count: 1, evidence_summary: "Selected 2/7 for 1/3 + 1/4." },
  ],
  "diego-ramirez": [{ subskill_id: commonDenominatorSubskillId, level: "needs_support", evidence_count: 1, evidence_summary: "Needs support selecting a shared denominator." }],
  "zara-bell": [{ subskill_id: commonDenominatorSubskillId, level: "needs_support", evidence_count: 1, evidence_summary: "Combined denominator values directly." }],
  "noah-brooks": [{ subskill_id: commonDenominatorSubskillId, level: "developing", evidence_count: 1, evidence_summary: "Found a common denominator with one reminder." }],
  "ava-patel": [{ subskill_id: commonDenominatorSubskillId, level: "not_started", evidence_count: 0, evidence_summary: "No recorded evidence yet." }],
  "leo-martin": [{ subskill_id: commonDenominatorSubskillId, level: "mastered", evidence_count: 2, evidence_summary: "Found common denominators independently twice." }],
  "imani-johnson": [{ subskill_id: "equivalent-fractions", level: "mastered", evidence_count: 2, evidence_summary: "Generated equivalent fractions independently twice." }],
  "owen-kim": [{ subskill_id: "subtract-unlike-denominators", level: "developing", evidence_count: 1, evidence_summary: "Subtracts with a visual model and one prompt." }],
};

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
  await assertNoError(await supabase.from("assignment_items").upsert(items.filter((item) => item.item_type === "diagnostic").map((item, position) => ({ assignment_id: diagnosticAssignmentId, item_id: item.id, position: position + 1 }))));

  const studentIds = students.map((student) => student.id);
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
  const masteryRows = students.flatMap((student) => subskills.map((subskill) => {
    const override = masteryByStudent[student.id]?.find((record) => record.subskill_id === subskill.id);
    return {
      student_id: student.id,
      subskill_id: subskill.id,
      level: override?.level ?? "not_started",
      evidence_count: override?.evidence_count ?? 0,
      evidence_summary: override?.evidence_summary ?? "No recorded evidence yet.",
    };
  }));
  await assertNoError(await supabase.from("mastery").insert(masteryRows));

  console.log(`Seeded ${students.length} students, ${subskills.length} sub-skills, and ${masteryRows.length} mastery records for ${classId}.`);
}

seed().catch((error: unknown) => {
  console.error("Rung seed failed:", error);
  process.exitCode = 1;
});
