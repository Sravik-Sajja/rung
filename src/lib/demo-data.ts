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
  // Equivalent fractions. Each names its target denominator, so it carries the
  // exact_denominator rule; without it, restating the original fraction scores correct.
  { id: "equivalent-1", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 1/2 with denominator 8.", answerSpec: { accepted: ["4/8"], rule: { kind: "exact_denominator", denominator: 8 } }, distractorMap: { "1/8": "changes_denominator_only" } },
  { id: "equivalent-2", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 2/3 with denominator 9.", answerSpec: { accepted: ["6/9"], rule: { kind: "exact_denominator", denominator: 9 } }, distractorMap: { "2/9": "changes_denominator_only" } },
  { id: "equivalent-3", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 1/4 with denominator 12.", answerSpec: { accepted: ["3/12"], rule: { kind: "exact_denominator", denominator: 12 } }, distractorMap: { "1/12": "changes_denominator_only" } },
  { id: "equivalent-4", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 3/5 with denominator 10.", answerSpec: { accepted: ["6/10"], rule: { kind: "exact_denominator", denominator: 10 } }, distractorMap: { "3/10": "changes_denominator_only" } },
  // Fractions on a number line.
  { id: "number-line-1", subskillId: canonicalDemoSubskillIds[1], prompt: "What fraction names point C on the number line?", answerSpec: { accepted: ["3/4"] }, visualSpec: { kind: "number_line", denominator: 4, markedNumerator: 3, pointLabel: "C" }, distractorMap: { "1/3": "reverses_numerator_and_denominator" } },
  { id: "number-line-2", subskillId: canonicalDemoSubskillIds[1], prompt: "What fraction names point A on the number line?", answerSpec: { accepted: ["2/5"] }, visualSpec: { kind: "number_line", denominator: 5, markedNumerator: 2, pointLabel: "A" }, distractorMap: { "5/2": "reverses_numerator_and_denominator" } },
  { id: "number-line-3", subskillId: canonicalDemoSubskillIds[1], prompt: "What fraction names point D on the number line?", answerSpec: { accepted: ["5/8"] }, visualSpec: { kind: "number_line", denominator: 8, markedNumerator: 5, pointLabel: "D" }, distractorMap: { "8/5": "reverses_numerator_and_denominator" } },
  { id: "number-line-4", subskillId: canonicalDemoSubskillIds[1], prompt: "What fraction names point E on the number line?", answerSpec: { accepted: ["5/6"] }, visualSpec: { kind: "number_line", denominator: 6, markedNumerator: 5, pointLabel: "E" }, distractorMap: { "6/5": "reverses_numerator_and_denominator" } },
  // Find a common denominator. Distractor is the sum of the two denominators.
  { id: "common-denominator-1", subskillId: canonicalDemoSubskillIds[2], prompt: "What common denominator can you use for 1/3 and 1/4?", answerSpec: { accepted: ["12"] }, distractorMap: { "7": "adds_denominators" } },
  { id: "common-denominator-2", subskillId: canonicalDemoSubskillIds[2], prompt: "What common denominator can you use for 2/5 and 1/3?", answerSpec: { accepted: ["15"] }, distractorMap: { "8": "adds_denominators" } },
  // Add unlike denominators. Distractor adds numerators and denominators straight across.
  { id: "add-unlike-1", subskillId: "add-unlike-denominators", prompt: "What is 1/3 + 1/4?", answerSpec: { accepted: ["7/12"] }, distractorMap: { "2/7": "adds_numerators_and_denominators" } },
  { id: "add-unlike-2", subskillId: "add-unlike-denominators", prompt: "What is 2/5 + 1/3?", answerSpec: { accepted: ["11/15"] }, distractorMap: { "3/8": "adds_numerators_and_denominators" } },
  { id: "add-unlike-3", subskillId: "add-unlike-denominators", prompt: "What is 1/2 + 1/5?", answerSpec: { accepted: ["7/10"] }, distractorMap: { "2/7": "adds_numerators_and_denominators" } },
  { id: "add-unlike-4", subskillId: "add-unlike-denominators", prompt: "What is 3/4 + 1/6?", answerSpec: { accepted: ["11/12"] }, distractorMap: { "4/10": "adds_numerators_and_denominators" } },
  // Subtract unlike denominators. Distractor subtracts numerators and denominators straight across.
  { id: "subtract-unlike-1", subskillId: "subtract-unlike-denominators", prompt: "What is 3/4 − 1/3?", answerSpec: { accepted: ["5/12"] }, distractorMap: { "2/1": "subtracts_numerators_and_denominators" } },
  { id: "subtract-unlike-2", subskillId: "subtract-unlike-denominators", prompt: "What is 5/6 − 1/4?", answerSpec: { accepted: ["7/12"] }, distractorMap: { "4/2": "subtracts_numerators_and_denominators" } },
  { id: "subtract-unlike-3", subskillId: "subtract-unlike-denominators", prompt: "What is 4/5 − 1/3?", answerSpec: { accepted: ["7/15"] }, distractorMap: { "3/2": "subtracts_numerators_and_denominators" } },
  { id: "subtract-unlike-4", subskillId: "subtract-unlike-denominators", prompt: "What is 7/8 − 1/3?", answerSpec: { accepted: ["13/24"] }, distractorMap: { "6/5": "subtracts_numerators_and_denominators" } }
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

// Each group links a reviewed Khan Academy video. The Khan page itself refuses
// framing, so the card embeds the underlying YouTube video via youtube-nocookie
// (the privacy-preserving host Khan itself uses). Every id below was taken from
// its Khan video page, not guessed.
const khanVideo = (title: string, url: string, youtubeId: string, verificationNote: string): TeacherGroupPlan["video"] => ({
  title,
  provider: "Khan Academy",
  url,
  embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
  verificationNote,
});
const reviewedEquivalentFractionsVideo = khanVideo(
  "Equivalent fractions with visual models",
  "https://www.khanacademy.org/math/arithmetic-home/arith-review-fractions/visualizing-equiv-frac/v/equivalent-fractions",
  "U2ovEuEUxXQ",
  "Reviewed: it builds equivalent fractions with visual models and shows why scaling the numerator and denominator together preserves value; fits the equivalent-fractions group.",
);
const reviewedNumberLineVideo = khanVideo(
  "Fractions on a number line",
  "https://www.khanacademy.org/math/cc-third-grade-math/imp-fractions/imp-fractions-on-the-number-line/v/fractions-on-a-number-line",
  "Z0WsfO-RI8Y",
  "Reviewed: it partitions a number line into equal parts and places a fraction by counting those parts; fits the number-line group.",
);
const reviewedCommonDenominatorVideo = khanVideo(
  "Adding fractions with unlike denominators",
  "https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3/imp-adding-and-subtracting-fractions-with-unlike-denominators/v/adding-small-fractions-with-unlike-denominators",
  "bcCLKACsYJ0",
  "Reviewed: it explicitly teaches finding a common denominator, rewriting equivalent fractions, then adding; it fits the common-denominator and add-unlike groups.",
);
const reviewedSubtractVideo = khanVideo(
  "Subtracting fractions with unlike denominators",
  "https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3/imp-adding-and-subtracting-fractions-with-unlike-denominators/v/subtracting-small-fractions-with-unlike-denominators",
  "2DPivVFCdqA",
  "Reviewed: it finds a common denominator, rewrites each fraction, then subtracts; the direct parallel to the adding video, fits the subtract group.",
);

export const demoGroupPlans: Record<string, TeacherGroupPlan> = {
  "equivalent-fractions": { groupId: "equivalent-fractions", objective: "Create and recognize equivalent fractions using visual and numerical models.", durationMinutes: 15, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: compare two shaded fraction strips." }, { minutes: 6, activity: "Model multiplying numerator and denominator by the same number." }, { minutes: 4, activity: "Partner practice with equivalent-fraction cards." }, { minutes: 2, activity: "Exit check: write an equivalent fraction for 1/2." }], checkForUnderstanding: "Students explain why both parts of a fraction change together.", practiceItemIds: ["equivalent-1", "equivalent-2", "equivalent-3", "equivalent-4"], video: reviewedEquivalentFractionsVideo },
  [canonicalTeacherGroupIds[1]]: { groupId: canonicalTeacherGroupIds[1], objective: "Locate benchmark fractions accurately on a number line.", durationMinutes: 15, materials: ["Number-line strips", "Pencils"], steps: [{ minutes: 3, activity: "Warm-up: mark 0, 1/2, and 1." }, { minutes: 5, activity: "Partition the line into equal fourths." }, { minutes: 5, activity: "Place and justify benchmark fractions." }, { minutes: 2, activity: "Exit check: identify the location of 3/4." }], checkForUnderstanding: "Students name the equal partitions used to place a fraction.", practiceItemIds: ["number-line-1", "number-line-2", "number-line-3", "number-line-4"], video: reviewedNumberLineVideo },
  [canonicalTeacherGroupIds[2]]: { groupId: canonicalTeacherGroupIds[2], objective: "Find a shared denominator before combining fractions with unlike denominators.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards", "Practice cards"], steps: [{ minutes: 3, activity: "Warm-up: compare thirds and fourths using fraction strips." }, { minutes: 6, activity: "Model rewriting 1/3 and 1/4 as twelfths." }, { minutes: 6, activity: "Students find a common denominator with a partner and explain their choice." }, { minutes: 3, activity: "Exit check: name a common denominator for 1/3 and 1/4." }], checkForUnderstanding: "Before adding, each student writes equivalent fractions with a shared denominator.", practiceItemIds: ["common-denominator-1", "common-denominator-2", "add-unlike-1", "add-unlike-2"], video: reviewedCommonDenominatorVideo },
  "add-unlike-denominators": { groupId: "add-unlike-denominators", objective: "Add fractions with unlike denominators by renaming each fraction first.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: identify the denominators in two fractions." }, { minutes: 6, activity: "Model finding twelfths and renaming each addend." }, { minutes: 6, activity: "Guided partner addition with fraction strips." }, { minutes: 3, activity: "Exit check: solve one unlike-denominator sum." }], checkForUnderstanding: "Students show the renamed addends before they add numerators.", practiceItemIds: ["add-unlike-1", "add-unlike-2", "add-unlike-3", "add-unlike-4"], video: reviewedCommonDenominatorVideo },
  "subtract-unlike-denominators": { groupId: "subtract-unlike-denominators", objective: "Subtract fractions with unlike denominators after renaming each fraction.", durationMinutes: 18, materials: ["Fraction strips", "Whiteboards"], steps: [{ minutes: 3, activity: "Warm-up: find a common denominator for thirds and fourths." }, { minutes: 6, activity: "Model renaming 3/4 and 1/3 as twelfths." }, { minutes: 6, activity: "Guided partner subtraction using a visual model." }, { minutes: 3, activity: "Exit check: solve one unlike-denominator difference." }], checkForUnderstanding: "Students can explain why the denominators are not subtracted.", practiceItemIds: ["subtract-unlike-1", "subtract-unlike-2", "subtract-unlike-3", "subtract-unlike-4"], video: reviewedSubtractVideo }
};
