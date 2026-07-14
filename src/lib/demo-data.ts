// Temporary in-memory canonical demo records; replace with server-side Supabase reads.
import type { DemoStudent, Item } from "@/lib/types";

export const demoStudents: DemoStudent[] = [
  { id: "maya-chen", displayName: "Maya Chen", gradeBand: "6–8" },
  { id: "noah-brooks", displayName: "Noah Brooks", gradeBand: "6–8" },
  { id: "ava-patel", displayName: "Ava Patel", gradeBand: "6–8" },
  { id: "leo-martin", displayName: "Leo Martin", gradeBand: "6–8" }
];

export const demoItems: Item[] = [{
  id: "add-unlike-1", subskillId: "common-denominator", prompt: "What is 1/3 + 1/4?",
  answerSpec: { accepted: ["7/12"] },
  distractorMap: { "2/7": "adds_numerators_and_denominators" }
}];
