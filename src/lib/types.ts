// Shared domain types used by UI, deterministic logic, and server contracts.
export type MasteryLevel = "not_started" | "needs_support" | "developing" | "mastered";
export type HintLevel = "nudge" | "hint" | "guided_step";

export interface DemoStudent { id: string; displayName: string; gradeBand: string; }
export interface Item { id: string; subskillId: string; prompt: string; answerSpec: { accepted: string[] }; distractorMap: Record<string, string>; }
export interface Diagnosis { subskillId: string; misconceptionTag: string; observation: string; nextStep: string; }
