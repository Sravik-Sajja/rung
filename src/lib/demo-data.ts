// Temporary in-memory canonical demo records; replace with server-side Supabase reads.
import type { DemoStudent, Item, MasteryRecord, Subskill, TeacherGroupPlan } from "@/lib/types";
import {
  canonicalDemoIds,
  canonicalDemoStudents,
  canonicalDemoSubskillIds,
  canonicalTeacherGroupIds,
} from "@/lib/demo/contracts";

export const DEMO_CLASS_ID = canonicalDemoIds.classId;

export const demoStudents: DemoStudent[] = canonicalDemoStudents.map((student) => ({ id: student.id, displayName: student.displayName, gradeBand: "6–8" }));

export const demoSubskills: Subskill[] = [
  { id: "equivalent-fractions", name: "Equivalent Fractions" },
  { id: canonicalDemoSubskillIds[1], name: "Fractions on a Number Line" },
  { id: canonicalDemoSubskillIds[2], name: "Find a Common Denominator" },
  { id: "add-unlike-denominators", name: "Add Unlike Denominators" },
  { id: "subtract-unlike-denominators", name: "Subtract Unlike Denominators" }
];

const levelSummary: Record<string, string> = {
  not_started: "No responses yet",
  needs_support: "Diagnostic evidence shows a gap",
  developing: "One supported correct response",
  mastered: "Two correct target-level responses"
};

const masteryLevels: Record<string, string[]> = {
  [canonicalDemoIds.mayaStudentId]: ["developing", "mastered", "needs_support", "needs_support", "not_started"],
  "diego-alvarez": ["needs_support", "developing", "needs_support", "developing", "not_started"],
  "zara-williams": ["developing", "mastered", "needs_support", "needs_support", "developing"],
  "noah-brooks": ["mastered", "developing", "developing", "developing", "developing"],
  "ava-patel": ["developing", "needs_support", "developing", "mastered", "needs_support"],
  "leo-martin": ["needs_support", "developing", "mastered", "not_started", "not_started"],
  "sofia-nguyen": ["mastered", "mastered", "mastered", "developing", "developing"],
  "ethan-williams": ["needs_support", "needs_support", "developing", "needs_support", "not_started"]
};

export const demoMastery: MasteryRecord[] = demoStudents.flatMap((student) =>
  demoSubskills.map((subskill, index) => {
    const level = masteryLevels[student.id][index] as MasteryRecord["level"];
    return { studentId: student.id, subskillId: subskill.id, level, evidenceSummary: levelSummary[level] };
  })
);

export const demoItems: Item[] = [
  // exact_denominator: the prompt names denominator 8, and scoring compares by value — without the
  // rule, answering "1/2" (the question restated) would score correct.
  { id: "equivalent-1", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 1/2 with denominator 8.", answerSpec: { accepted: ["4/8"], rule: { kind: "exact_denominator", denominator: 8 } }, distractorMap: { "1/8": "changes_denominator_only" } },
  { id: "number-line-1", subskillId: canonicalDemoSubskillIds[1], prompt: "What fraction names point C on the number line?", answerSpec: { accepted: ["3/4"] }, visualSpec: { kind: "number_line", denominator: 4, markedNumerator: 3, pointLabel: "C" }, distractorMap: { "1/3": "reverses_numerator_and_denominator" } },
  { id: "common-denominator-1", subskillId: canonicalDemoSubskillIds[2], prompt: "What common denominator can you use for 1/3 and 1/4?", answerSpec: { accepted: ["12"] }, distractorMap: { "7": "adds_denominators" } },
  { id: "common-denominator-2", subskillId: canonicalDemoSubskillIds[2], prompt: "What common denominator can you use for 2/5 and 1/3?", answerSpec: { accepted: ["15"] }, distractorMap: { "8": "adds_denominators" } },
  { id: "add-unlike-1", subskillId: "add-unlike-denominators", prompt: "What is 1/3 + 1/4?", answerSpec: { accepted: ["7/12"] }, distractorMap: { "2/7": "adds_numerators_and_denominators" } },
  { id: "add-unlike-2", subskillId: "add-unlike-denominators", prompt: "What is 2/5 + 1/3?", answerSpec: { accepted: ["11/15"] }, distractorMap: { "3/8": "adds_numerators_and_denominators" } },
  { id: "subtract-unlike-1", subskillId: "subtract-unlike-denominators", prompt: "What is 3/4 − 1/3?", answerSpec: { accepted: ["5/12"] }, distractorMap: { "2/1": "subtracts_numerators_and_denominators" } }
];

export const demoDiagnosticItems: Item[] = [{
  id: "diagnostic-add-unlike-1",
  subskillId: "add-unlike-denominators",
  prompt: "What is 1/3 + 1/4?",
  answerSpec: { accepted: ["7/12"] },
  distractorMap: { "2/7": "adds_numerators_and_denominators" }
}];

export function findDemoItem(itemId: string) {
  return [...demoItems, ...demoDiagnosticItems].find((item) => item.id === itemId);
}

const vettedVideo = (title: string): TeacherGroupPlan["video"] => ({ title, provider: "Rung reviewed resource", url: "#", verificationNote: "Placeholder for the pre-vetted video URL seeded before the demo." });
const reviewedCommonDenominatorVideo: TeacherGroupPlan["video"] = {
  title: "Adding fractions with unlike denominators",
  provider: "Khan Academy",
  url: "https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3/imp-adding-and-subtracting-fractions-with-unlike-denominators/v/adding-small-fractions-with-unlike-denominators",
  verificationNote: "Reviewed: it explicitly teaches finding a common denominator, rewriting equivalent fractions, then adding; it fits the primary Maya/common-denominator group.",
};

export const demoGroupPlans: Record<string, TeacherGroupPlan> = {
  "equivalent-fractions": { groupId: "equivalent-fractions", objective: "Create and recognize equivalent fractions using visual and numerical models.", durationMinutes: 15, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: compare two shaded fraction strips." }, { minutes: 6, activity: "Model multiplying numerator and denominator by the same number." }, { minutes: 4, activity: "Partner practice with equivalent-fraction cards." }, { minutes: 2, activity: "Exit check: write an equivalent fraction for 1/2." }], checkForUnderstanding: "Students explain why both parts of a fraction change together.", practiceItemIds: ["equivalent-1"], video: vettedVideo("Equivalent fractions with visual models") },
  [canonicalTeacherGroupIds[1]]: { groupId: canonicalTeacherGroupIds[1], objective: "Locate benchmark fractions accurately on a number line.", durationMinutes: 15, materials: ["Number-line strips", "Pencils"], steps: [{ minutes: 3, activity: "Warm-up: mark 0, 1/2, and 1." }, { minutes: 5, activity: "Partition the line into equal fourths." }, { minutes: 5, activity: "Place and justify benchmark fractions." }, { minutes: 2, activity: "Exit check: identify the location of 3/4." }], checkForUnderstanding: "Students name the equal partitions used to place a fraction.", practiceItemIds: ["number-line-1"], video: vettedVideo("Fractions on a number line") },
  [canonicalTeacherGroupIds[2]]: { groupId: canonicalTeacherGroupIds[2], objective: "Find a shared denominator before combining fractions with unlike denominators.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards", "Practice cards"], steps: [{ minutes: 3, activity: "Warm-up: compare thirds and fourths using fraction strips." }, { minutes: 6, activity: "Model rewriting 1/3 and 1/4 as twelfths." }, { minutes: 6, activity: "Students find a common denominator with a partner and explain their choice." }, { minutes: 3, activity: "Exit check: name a common denominator for 1/3 and 1/4." }], checkForUnderstanding: "Before adding, each student writes equivalent fractions with a shared denominator.", practiceItemIds: ["common-denominator-1", "add-unlike-1"], video: reviewedCommonDenominatorVideo },
  "add-unlike-denominators": { groupId: "add-unlike-denominators", objective: "Add fractions with unlike denominators by renaming each fraction first.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: identify the denominators in two fractions." }, { minutes: 6, activity: "Model finding twelfths and renaming each addend." }, { minutes: 6, activity: "Guided partner addition with fraction strips." }, { minutes: 3, activity: "Exit check: solve one unlike-denominator sum." }], checkForUnderstanding: "Students show the renamed addends before they add numerators.", practiceItemIds: ["common-denominator-1", "add-unlike-1"], video: vettedVideo("Adding fractions with unlike denominators") },
  "subtract-unlike-denominators": { groupId: "subtract-unlike-denominators", objective: "Subtract fractions with unlike denominators after renaming each fraction.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: find a common denominator for thirds and fourths." }, { minutes: 6, activity: "Model renaming 3/4 and 1/3 as twelfths." }, { minutes: 6, activity: "Guided partner subtraction using a visual model." }, { minutes: 3, activity: "Exit check: solve one unlike-denominator difference." }], checkForUnderstanding: "Students can explain why the denominators are not subtracted.", practiceItemIds: ["common-denominator-1", "subtract-unlike-1"], video: vettedVideo("Subtracting fractions with unlike denominators") }
};
