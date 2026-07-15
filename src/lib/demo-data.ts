// Temporary in-memory canonical demo records; replace with server-side Supabase reads.
import type { DemoStudent, Item, MasteryRecord, Subskill, TeacherGroupPlan } from "@/lib/types";

export const DEMO_CLASS_ID = "rivera-fractions";

export const demoStudents: DemoStudent[] = [
  { id: "maya-chen", displayName: "Maya Chen", gradeBand: "6–8" },
  { id: "noah-brooks", displayName: "Noah Brooks", gradeBand: "6–8" },
  { id: "ava-patel", displayName: "Ava Patel", gradeBand: "6–8" },
  { id: "leo-martin", displayName: "Leo Martin", gradeBand: "6–8" },
  { id: "sofia-nguyen", displayName: "Sofia Nguyen", gradeBand: "6–8" },
  { id: "ethan-williams", displayName: "Ethan Williams", gradeBand: "6–8" },
  { id: "isabella-ross", displayName: "Isabella Ross", gradeBand: "6–8" },
  { id: "mateo-garcia", displayName: "Mateo Garcia", gradeBand: "6–8" },
  { id: "zoe-kim", displayName: "Zoe Kim", gradeBand: "6–8" },
  { id: "jackson-lee", displayName: "Jackson Lee", gradeBand: "6–8" }
];

export const demoSubskills: Subskill[] = [
  { id: "equivalent-fractions", name: "Equivalent fractions" },
  { id: "number-line", name: "Fractions on a number line" },
  { id: "common-denominator", name: "Find a common denominator" },
  { id: "add-unlike-denominators", name: "Add unlike denominators" },
  { id: "subtract-unlike-denominators", name: "Subtract unlike denominators" }
];

const levelSummary: Record<string, string> = {
  not_started: "No responses yet",
  needs_support: "Diagnostic evidence shows a gap",
  developing: "One supported correct response",
  mastered: "Two correct target-level responses"
};

const masteryLevels: Record<string, string[]> = {
  "maya-chen": ["developing", "mastered", "needs_support", "needs_support", "not_started"],
  "noah-brooks": ["mastered", "developing", "needs_support", "needs_support", "developing"],
  "ava-patel": ["developing", "mastered", "needs_support", "developing", "needs_support"],
  "leo-martin": ["needs_support", "developing", "developing", "not_started", "not_started"],
  "sofia-nguyen": ["mastered", "mastered", "mastered", "developing", "developing"],
  "ethan-williams": ["needs_support", "needs_support", "developing", "needs_support", "not_started"],
  "isabella-ross": ["developing", "developing", "mastered", "mastered", "mastered"],
  "mateo-garcia": ["not_started", "needs_support", "needs_support", "developing", "not_started"],
  "zoe-kim": ["mastered", "developing", "mastered", "developing", "developing"],
  "jackson-lee": ["developing", "not_started", "developing", "needs_support", "needs_support"]
};

export const demoMastery: MasteryRecord[] = demoStudents.flatMap((student) =>
  demoSubskills.map((subskill, index) => {
    const level = masteryLevels[student.id][index] as MasteryRecord["level"];
    return { studentId: student.id, subskillId: subskill.id, level, evidenceSummary: levelSummary[level] };
  })
);

export const demoItems: Item[] = [
  { id: "equivalent-1", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 1/2 with denominator 8.", answerSpec: { accepted: ["4/8"] }, distractorMap: { "1/8": "changes_denominator_only" } },
  { id: "number-line-1", subskillId: "number-line", prompt: "Which point is 3/4 of the way from 0 to 1?", answerSpec: { accepted: ["3/4"] }, distractorMap: { "1/3": "reverses_numerator_and_denominator" } },
  { id: "common-denominator-1", subskillId: "common-denominator", prompt: "What common denominator can you use for 1/3 and 1/4?", answerSpec: { accepted: ["12"] }, distractorMap: { "7": "adds_denominators" } },
  { id: "add-unlike-1", subskillId: "add-unlike-denominators", prompt: "What is 1/3 + 1/4?", answerSpec: { accepted: ["7/12"] }, distractorMap: { "2/7": "adds_numerators_and_denominators" } },
  { id: "subtract-unlike-1", subskillId: "subtract-unlike-denominators", prompt: "What is 3/4 − 1/3?", answerSpec: { accepted: ["5/12"] }, distractorMap: { "2/1": "subtracts_numerators_and_denominators" } }
];

const vettedVideo = (title: string): TeacherGroupPlan["video"] => ({ title, provider: "Rung reviewed resource", url: "#", verificationNote: "Placeholder for the pre-vetted video URL seeded before the demo." });

export const demoGroupPlans: Record<string, TeacherGroupPlan> = {
  "equivalent-fractions": { groupId: "equivalent-fractions", objective: "Create and recognize equivalent fractions using visual and numerical models.", durationMinutes: 15, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: compare two shaded fraction strips." }, { minutes: 6, activity: "Model multiplying numerator and denominator by the same number." }, { minutes: 4, activity: "Partner practice with equivalent-fraction cards." }, { minutes: 2, activity: "Exit check: write an equivalent fraction for 1/2." }], checkForUnderstanding: "Students explain why both parts of a fraction change together.", practiceItemIds: ["equivalent-1"], video: vettedVideo("Equivalent fractions with visual models") },
  "number-line": { groupId: "number-line", objective: "Locate benchmark fractions accurately on a number line.", durationMinutes: 15, materials: ["Number-line strips", "Pencils"], steps: [{ minutes: 3, activity: "Warm-up: mark 0, 1/2, and 1." }, { minutes: 5, activity: "Partition the line into equal fourths." }, { minutes: 5, activity: "Place and justify benchmark fractions." }, { minutes: 2, activity: "Exit check: identify the location of 3/4." }], checkForUnderstanding: "Students name the equal partitions used to place a fraction.", practiceItemIds: ["number-line-1"], video: vettedVideo("Fractions on a number line") },
  "common-denominator": { groupId: "common-denominator", objective: "Find a shared denominator before combining fractions with unlike denominators.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards", "Practice cards"], steps: [{ minutes: 3, activity: "Warm-up: compare thirds and fourths using fraction strips." }, { minutes: 6, activity: "Model rewriting 1/3 and 1/4 as twelfths." }, { minutes: 6, activity: "Students find a common denominator with a partner and explain their choice." }, { minutes: 3, activity: "Exit check: name a common denominator for 1/3 and 1/4." }], checkForUnderstanding: "Before adding, each student writes equivalent fractions with a shared denominator.", practiceItemIds: ["common-denominator-1", "add-unlike-1"], video: vettedVideo("Finding common denominators") },
  "add-unlike-denominators": { groupId: "add-unlike-denominators", objective: "Add fractions with unlike denominators by renaming each fraction first.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: identify the denominators in two fractions." }, { minutes: 6, activity: "Model finding twelfths and renaming each addend." }, { minutes: 6, activity: "Guided partner addition with fraction strips." }, { minutes: 3, activity: "Exit check: solve one unlike-denominator sum." }], checkForUnderstanding: "Students show the renamed addends before they add numerators.", practiceItemIds: ["common-denominator-1", "add-unlike-1"], video: vettedVideo("Adding fractions with unlike denominators") },
  "subtract-unlike-denominators": { groupId: "subtract-unlike-denominators", objective: "Subtract fractions with unlike denominators after renaming each fraction.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: find a common denominator for thirds and fourths." }, { minutes: 6, activity: "Model renaming 3/4 and 1/3 as twelfths." }, { minutes: 6, activity: "Guided partner subtraction using a visual model." }, { minutes: 3, activity: "Exit check: solve one unlike-denominator difference." }], checkForUnderstanding: "Students can explain why the denominators are not subtracted.", practiceItemIds: ["common-denominator-1", "subtract-unlike-1"], video: vettedVideo("Subtracting fractions with unlike denominators") }
};
