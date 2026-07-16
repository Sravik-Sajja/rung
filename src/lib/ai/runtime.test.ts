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
  return { studentId: "maya-chen", item: safeItem, attempt: "I tried 3 + 4", level: "hint" as const, promptVersion: "tutor-v1" };
}

describe("live AI adapter resolution", () => {
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

  it("allows GPT-5.6 Terra to be selected per feature without changing the Luna default", () => {
    expect(modelFor("diagnosis_explanation", { defaultModel: DEFAULT_AI_MODEL, diagnosis_explanation: "gpt-5.6-terra" }))
      .toBe("gpt-5.6-terra");
    expect(modelFor("tutor_hint", { defaultModel: DEFAULT_AI_MODEL })).toBe("gpt-5.6-luna");
  });
});
