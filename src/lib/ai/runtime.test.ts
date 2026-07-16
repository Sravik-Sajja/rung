import { describe, expect, it } from "vitest";
import type { AiRunLookup, AiRunRecord, AiRunStore, StructuredCompletionClient, StructuredCompletionRequest } from "@/lib/ai/runtime";
import { createAiAdapter, DEFAULT_AI_MODEL, modelFor } from "@/lib/ai/runtime";

class FakeRunStore implements AiRunStore {
  readonly records: AiRunRecord[] = [];
  cached: unknown | null = null;

  async findValid(_input: AiRunLookup): Promise<unknown | null> {
    return this.cached;
  }

  async record(input: AiRunRecord): Promise<string> {
    this.records.push(input);
    return `run-${this.records.length}`;
  }
}

class FakeCompletionClient implements StructuredCompletionClient {
  readonly requests: StructuredCompletionRequest[] = [];

  constructor(private readonly response: unknown | Error) {}

  async complete(input: StructuredCompletionRequest): Promise<unknown> {
    this.requests.push(input);
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

const safeItem = {
  id: "practice-common-denominator-1",
  subskillId: "find-common-denominator",
  gradeBand: "6-8",
  prompt: "Find a common denominator for 1/3 and 1/4.",
  difficulty: 1,
};

function tutorInput() {
  return {
    studentId: "maya-chen",
    item: safeItem,
    attempt: "I tried 3 + 4",
    level: "hint" as const,
    promptVersion: "tutor-v1",
    protection: {
      protectedAnswers: ["12"],
      protectedAnswerRule: { kind: "positive_common_multiple" as const, denominators: [3, 4] as [number, number] },
      protectedSolutionSteps: [
        "List multiples of 3 and multiples of 4.",
        "The first number in both lists is 12, so 12 is a common denominator.",
      ],
    },
  };
}

function workAnalysisInput() {
  return {
    studentId: "maya-chen",
    item: { ...safeItem, id: "common-denominator-1" },
    writtenWork: "I added 3 and 4 because I did not know what denominator to use.",
    imageDataUrl: "data:image/png;base64,AA==",
    protectedAnswers: ["12"],
    protectedAnswerRule: { kind: "positive_common_multiple" as const, denominators: [3, 4] as [number, number] },
    protectedSolutionSteps: ["Rewrite each fraction with denominator 12."],
    promptVersion: "work-analysis-v1",
  };
}

describe("live AI adapter resolution", () => {
  it("uses the default model when an optional feature override is blank", () => {
    expect(modelFor("practice_plan", { defaultModel: "gpt-5.6-terra", practice_plan: "" })).toBe("gpt-5.6-terra");
  });

  it("uses a schema-valid live response and records it as valid", async () => {
    const store = new FakeRunStore();
    const client = new FakeCompletionClient({ hint: "What multiple do both denominators share?" });
    const adapter = createAiAdapter({ completionClient: client, runStore: store });

    const result = await adapter.tutorHint(tutorInput());

    expect(result.source).toBe("ai");
    expect(result.leakCheck).toBe("passed");
    expect(store.records.at(-1)?.status).toBe("valid");
    expect(client.requests[0]?.model).toBe(DEFAULT_AI_MODEL);
  });

  it("keeps private tutor protection out of the model request and ai-run record", async () => {
    const store = new FakeRunStore();
    const client = new FakeCompletionClient({ hint: "What multiple do both denominators share?" });
    const input = tutorInput();

    await createAiAdapter({ completionClient: client, runStore: store }).tutorHint(input);

    expect(client.requests[0]?.user).not.toContain(input.protection.protectedAnswers[0]);
    expect(client.requests[0]?.user).not.toContain(input.protection.protectedSolutionSteps[0]);
    expect(client.requests[0]?.system).not.toContain(input.protection.protectedSolutionSteps[0]);
    expect(store.records.at(-1)?.outputJson).toEqual({ hint: "What multiple do both denominators share?" });
    expect(store.records.at(-1)).not.toHaveProperty("protection");

    await createAiAdapter({ completionClient: client, runStore: store }).tutorHint({
      ...input,
      protection: {
        protectedAnswers: ["999"],
        protectedSolutionSteps: ["A different private solution phrase."],
      },
    });
    expect(store.records[1]?.inputHash).toBe(store.records[0]?.inputHash);
  });

  it("uses a prior valid cache entry after a live failure", async () => {
    const store = new FakeRunStore();
    store.cached = { hint: "Which number is a multiple of both denominators?" };
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient(new Error("network unavailable")),
      runStore: store,
    });

    const result = await adapter.tutorHint(tutorInput());

    expect(result.source).toBe("cache");
    expect(result.hint).toContain("multiple");
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "cache_hit"]);
  });

  it("falls back safely when a live response is malformed or leaks an answer", async () => {
    const store = new FakeRunStore();
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient({ hint: "The final answer is 7/12." }),
      runStore: store,
    });

    const result = await adapter.tutorHint(tutorInput());

    expect(result.source).toBe("fallback");
    expect(result.leakCheck).toBe("fallback");
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "fallback"]);
  });

  it("falls back when a live hint exposes an exact standalone numeric answer", async () => {
    const store = new FakeRunStore();
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient({ hint: "Use 12 as the shared denominator." }),
      runStore: store,
    });

    const result = await adapter.tutorHint(tutorInput());

    expect(result.source).toBe("fallback");
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "fallback"]);
  });

  it("falls back when a live hint exposes an equivalent rational or protected solution phrase", async () => {
    const equivalentStore = new FakeRunStore();
    const equivalent = await createAiAdapter({
      completionClient: new FakeCompletionClient({ hint: "Rewrite the sum as 14/24 before simplifying." }),
      runStore: equivalentStore,
    }).tutorHint({
      ...tutorInput(),
      item: { ...safeItem, id: "ai-practice-add-1", subskillId: "add-unlike-denominators" },
      protection: {
        protectedAnswers: ["7/12"],
        protectedSolutionSteps: ["Rewrite 1/3 as 4/12 and 1/4 as 3/12."],
      },
    });
    expect(equivalent.source).toBe("fallback");

    const phraseStore = new FakeRunStore();
    const phrase = await createAiAdapter({
      completionClient: new FakeCompletionClient({ hint: "List multiples of 3 and multiples of 4." }),
      runStore: phraseStore,
    }).tutorHint(tutorInput());
    expect(phrase.source).toBe("fallback");
  });

  it("rejects a cached structured common-multiple answer leak", async () => {
    const store = new FakeRunStore();
    store.cached = { hint: "Try 24 as the common denominator." };
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient(new Error("network unavailable")),
      runStore: store,
    });

    const result = await adapter.tutorHint(tutorInput());

    expect(result.source).toBe("fallback");
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "fallback"]);
  });

  it("uses Maya's reviewed hint ladder when the item-specific fallback is needed", async () => {
    const adapter = createAiAdapter({ completionClient: null, runStore: new FakeRunStore() });

    const result = await adapter.tutorHint({
      ...tutorInput(),
      item: { ...safeItem, id: "common-denominator-1" },
      level: "guided_step",
    });

    expect(result.source).toBe("fallback");
    expect(result.hint).toBe("Make one column that counts by 3 and another that counts by 4. Compare the columns until a number appears in both.");
  });

  it("uses a target-specific deterministic fallback for generated items", async () => {
    const adapter = createAiAdapter({ completionClient: null, runStore: new FakeRunStore() });
    const result = await adapter.tutorHint({
      ...tutorInput(),
      item: {
        id: "ai-practice-number-line-1",
        subskillId: "fraction-number-line",
        gradeBand: "6-8",
        prompt: "Which point is 3/4 of the way from 0 to 1?",
        difficulty: 1,
      },
      protection: {
        protectedAnswers: ["3/4"],
        protectedSolutionSteps: ["Divide the interval from zero to one into four equal parts."],
      },
      level: "hint",
    });

    expect(result.source).toBe("fallback");
    expect(result.hint).toContain("equal parts");
    expect(result.hint).not.toContain("multiple");
  });

  it("returns a structured generated practice plan and records a live plan run", async () => {
    const store = new FakeRunStore();
    const client = new FakeCompletionClient({ items: [
      { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 },
      { kind: "fraction_operation", operation: "add", leftNumerator: 2, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
      { kind: "fraction_operation", operation: "add", leftNumerator: 3, leftDenominator: 8, rightNumerator: 1, rightDenominator: 6 },
    ] });
    const result = await createAiAdapter({ completionClient: client, runStore: store }).generatePracticePlan({
      studentId: "maya-chen", targetSubskillId: "add-unlike-denominators", misconceptionTags: ["adds_denominators"], promptVersion: "practice-plan-v1",
    });

    expect(result.source).toBe("ai");
    expect(result.items).toHaveLength(3);
    expect(store.records.at(-1)?.feature).toBe("practice_plan");
  });

  it("falls back to the target-safe operation when a live plan mismatches the diagnosed target", async () => {
    const store = new FakeRunStore();
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient({ items: [
        { kind: "fraction_operation", operation: "add", leftNumerator: 1, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 },
        { kind: "fraction_operation", operation: "add", leftNumerator: 2, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
        { kind: "fraction_operation", operation: "add", leftNumerator: 3, leftDenominator: 8, rightNumerator: 1, rightDenominator: 6 },
      ] }),
      runStore: store,
    });

    const result = await adapter.generatePracticePlan({
      studentId: "maya-chen",
      targetSubskillId: "subtract-unlike-denominators",
      misconceptionTags: ["subtracts_numerators_and_denominators"],
      promptVersion: "practice-plan-v1",
    });

    expect(result.source).toBe("fallback");
    expect(result.items.every((item) => item.kind === "fraction_operation" && item.operation === "subtract")).toBe(true);
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "fallback"]);
  });

  it("uses the selected deterministic misconception tag for Maya's diagnosis fallback", async () => {
    const adapter = createAiAdapter({ completionClient: null, runStore: new FakeRunStore() });

    const result = await adapter.diagnoseExplanation({
      studentId: "maya-chen",
      assignmentId: "diagnostic-fractions-v1",
      gradeBand: "6-8",
      targetSubskillId: "find-common-denominator",
      supportedMisconceptionTags: ["adds_denominators"],
      evidence: [{
        itemId: "diagnostic-common-denominator-1",
        subskillId: "find-common-denominator",
        misconceptionTag: "adds_denominators",
        selectedAnswer: "7",
      }],
      promptVersion: "diagnosis-v2-maya-fractions",
    });

    expect(result).toMatchObject({
      source: "fallback",
      misconceptionTag: "adds_denominators",
      observation: "Your response combined denominators instead of looking for a shared denominator.",
    });
  });

  it("fails closed for peer verification when neither live nor cached output is available", async () => {
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient(new Error("offline")),
      runStore: new FakeRunStore(),
    });

    const result = await adapter.verifyAttempt({
      studentId: "maya-chen",
      item: safeItem,
      attemptText: "I added 3 and 4.",
      explanation: "I thought the denominators could be added.",
      normalizedAttemptText: "i added 3 and 4",
      promptVersion: "attempt-v1",
    });

    expect(result.source).toBe("fallback");
    expect(result.onTopic).toBe(false);
    expect(result.nonTrivial).toBe(false);
  });

  it("uses a vision-capable work-analysis request without recording typed work or image data", async () => {
    const store = new FakeRunStore();
    const input = workAnalysisInput();
    const client = new FakeCompletionClient({
      observation: "The denominators still need a shared value before the fractions can be combined.",
      nextStep: "List a few multiples for each denominator and look for the first value they share.",
      checkQuestion: "Which number appears in both lists?",
      imageRead: "readable",
    });
    const adapter = createAiAdapter({ completionClient: client, runStore: store });

    const result = await adapter.analyzeWork(input);

    expect(result).toMatchObject({ source: "ai", imageRead: "readable", leakCheck: "passed" });
    expect(client.requests[0]).toMatchObject({
      model: DEFAULT_AI_MODEL,
      schemaName: "work_analysis",
      imageDataUrl: input.imageDataUrl,
    });
    expect(JSON.stringify(store.records)).not.toContain(input.writtenWork);
    expect(JSON.stringify(store.records)).not.toContain(input.imageDataUrl);
    expect(store.records.at(-1)?.inputHash).not.toContain("12");
  });

  it("falls back when work analysis leaks a standalone short protected answer", async () => {
    const store = new FakeRunStore();
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient({
        observation: "Use 12 as the denominator for the fractions.",
        nextStep: "Then continue with the fraction addition.",
        checkQuestion: "What would you do after that?",
        imageRead: "readable",
      }),
      runStore: store,
    });

    const result = await adapter.analyzeWork(workAnalysisInput());

    expect(result.source).toBe("fallback");
    expect(result.leakCheck).toBe("fallback");
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "fallback"]);
  });

  it("screens alternate valid common multiples in work analysis", async () => {
    const store = new FakeRunStore();
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient({
        observation: "You are comparing the denominators.",
        nextStep: "Try 24 as the common denominator.",
        checkQuestion: "What happens when both fractions use that denominator?",
        imageRead: "readable",
      }),
      runStore: store,
    });

    const result = await adapter.analyzeWork(workAnalysisInput());

    expect(result.source).toBe("fallback");
    expect(result.leakCheck).toBe("fallback");
  });

  it("requires imageRead to agree with whether a work photo was supplied", async () => {
    const store = new FakeRunStore();
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient({
        observation: "Start by comparing the denominators.",
        nextStep: "List a few multiples for each denominator.",
        checkQuestion: "Which number appears in both lists?",
        imageRead: "readable",
      }),
      runStore: store,
    });

    const result = await adapter.analyzeWork({ ...workAnalysisInput(), imageDataUrl: undefined });

    expect(result).toMatchObject({ source: "fallback", imageRead: "not_provided", leakCheck: "fallback" });
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "fallback"]);
  });

  it("falls back when work analysis repeats a protected solution step", async () => {
    const store = new FakeRunStore();
    const input = {
      ...workAnalysisInput(),
      protectedSolutionSteps: ["Make equivalent fractions before you combine the numerators."],
    };
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient({
        observation: "You are beginning to compare the fractions.",
        nextStep: "Make equivalent fractions before you combine the numerators.",
        checkQuestion: "What needs to match before you combine fractions?",
        imageRead: "readable",
      }),
      runStore: store,
    });

    const result = await adapter.analyzeWork(input);

    expect(result.source).toBe("fallback");
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "fallback"]);
  });

  it("uses a prior safe work-analysis cache entry after a live failure", async () => {
    const store = new FakeRunStore();
    store.cached = {
      observation: "You have started by looking at the denominators.",
      nextStep: "Write a short list of multiples for each denominator.",
      checkQuestion: "Which value appears in both lists?",
      imageRead: "unclear",
    };
    const adapter = createAiAdapter({
      completionClient: new FakeCompletionClient(new Error("network unavailable")),
      runStore: store,
    });

    const result = await adapter.analyzeWork(workAnalysisInput());

    expect(result).toMatchObject({ source: "cache", imageRead: "unclear", leakCheck: "passed" });
    expect(store.records.map((record) => record.status)).toEqual(["live_failed", "cache_hit"]);
  });

  it("allows GPT-5.6 Terra to be selected per feature without changing the Luna default", () => {
    expect(modelFor("diagnosis_explanation", { defaultModel: DEFAULT_AI_MODEL, diagnosis_explanation: "gpt-5.6-terra" }))
      .toBe("gpt-5.6-terra");
    expect(modelFor("tutor_hint", { defaultModel: DEFAULT_AI_MODEL })).toBe("gpt-5.6-luna");
    expect(modelFor("work_analysis", { defaultModel: DEFAULT_AI_MODEL })).toBe("gpt-5.6-luna");
  });
});
