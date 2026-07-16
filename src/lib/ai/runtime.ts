import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzeWorkInputSchema, generatedPracticePlanSchema } from "@/lib/ai/contracts";
import type {
  AiSource,
  AttemptVerification,
  AnalyzeWorkInput,
  DiagnosisExplanation,
  HintLevel,
  ItemWrap,
  ParametricItem,
  RungAiAdapter,
  SafeItem,
  TutorHint,
  WorkAnalysis,
  GeneratedPracticePlan,
} from "@/lib/ai/contracts";
import { attemptVerificationFallback, getTutorHintFallback, mayaDiagnosisFallback } from "@/lib/ai/fixtures";
import { getMayaDiagnosisContent } from "@/lib/content/maya-fractions";
import { containsAnswerLeak, containsGenericTutorLeak } from "@/lib/ai/leakage";

export type AiFeature = "diagnosis_explanation" | "tutor_hint" | "attempt_verification" | "work_analysis" | "practice_plan" | "item_wrap";
export type AiRunStatus = "valid" | "live_failed" | "cache_hit" | "fallback";

export const DEFAULT_AI_MODEL = "gpt-5.6-luna";

export interface AiModelConfig {
  defaultModel?: string;
  diagnosis_explanation?: string;
  tutor_hint?: string;
  attempt_verification?: string;
  work_analysis?: string;
  practice_plan?: string;
  item_wrap?: string;
}

export interface AiRunLookup {
  feature: AiFeature;
  inputHash: string;
  promptVersion: string;
}

export interface AiRunRecord extends AiRunLookup {
  model: string | null;
  status: AiRunStatus;
  latencyMs: number;
  outputJson: unknown;
}

export interface AiRunStore {
  findValid(input: AiRunLookup): Promise<unknown | null>;
  record(input: AiRunRecord): Promise<string>;
}

export interface StructuredCompletionRequest {
  model: string;
  system: string;
  user: string;
  /** Optional private image input used only for a single vision completion. */
  imageDataUrl?: string;
  schema: z.ZodTypeAny;
  schemaName: string;
}

/** Inject this boundary in tests; it is the only object that makes network calls. */
export interface StructuredCompletionClient {
  complete(input: StructuredCompletionRequest): Promise<unknown>;
}

export interface AiAdapterOptions {
  completionClient?: StructuredCompletionClient | null;
  runStore?: AiRunStore;
  models?: AiModelConfig;
}

const diagnosisPayloadSchema = z.object({
  misconceptionTag: z.string().min(1),
  observation: z.string().min(1),
  explanation: z.string().min(1),
  nextStep: z.string().min(1),
});

const tutorPayloadSchema = z.object({ hint: z.string().min(1) });

const attemptPayloadSchema = z.object({
  onTopic: z.boolean(),
  nonTrivial: z.boolean(),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const workAnalysisPayloadSchema = z.object({
  observation: z.string().trim().min(1).max(280),
  nextStep: z.string().trim().min(1).max(280),
  checkQuestion: z.string().trim().min(1).max(200),
  imageRead: z.enum(["not_provided", "readable", "unclear"]),
});

const itemWrapPayloadSchema = z.object({ prompt: z.string().min(1) });
const practicePlanPayloadSchema = z.object({ items: generatedPracticePlanSchema.shape.items });

type ResolvedPayload<Payload> = { payload: Payload; source: AiSource; aiRunId: string };

/**
 * Runs a structured response with the demo-safe priority order:
 * live, then a prior valid cache entry, then a deterministic fallback.
 */
async function resolveStructuredPayload<Payload>(input: {
  feature: AiFeature;
  promptVersion: string;
  inputHash: string;
  model: string;
  schema: z.ZodType<Payload>;
  request: Omit<StructuredCompletionRequest, "model" | "schema">;
  completionClient: StructuredCompletionClient | null;
  runStore: AiRunStore;
  fallback: () => Payload;
  validate?: (payload: Payload) => void;
}): Promise<ResolvedPayload<Payload>> {
  const startedAt = Date.now();

  if (input.completionClient) {
    try {
      const raw = await input.completionClient.complete({
        ...input.request,
        model: input.model,
        schema: input.schema,
      });
      const payload = input.schema.parse(raw);
      input.validate?.(payload);
      const aiRunId = await recordSafely(input.runStore, {
        feature: input.feature,
        inputHash: input.inputHash,
        promptVersion: input.promptVersion,
        model: input.model,
        status: "valid",
        latencyMs: Date.now() - startedAt,
        outputJson: payload,
      });
      return { payload, source: "ai", aiRunId };
    } catch {
      await recordSafely(input.runStore, {
        feature: input.feature,
        inputHash: input.inputHash,
        promptVersion: input.promptVersion,
        model: input.model,
        status: "live_failed",
        latencyMs: Date.now() - startedAt,
        outputJson: null,
      });
    }
  }

  try {
    const cached = await input.runStore.findValid({
      feature: input.feature,
      inputHash: input.inputHash,
      promptVersion: input.promptVersion,
    });
    if (cached !== null) {
      const payload = input.schema.parse(cached);
      input.validate?.(payload);
      const aiRunId = await recordSafely(input.runStore, {
        feature: input.feature,
        inputHash: input.inputHash,
        promptVersion: input.promptVersion,
        model: input.model,
        status: "cache_hit",
        latencyMs: Date.now() - startedAt,
        outputJson: payload,
      });
      return { payload, source: "cache", aiRunId };
    }
  } catch {
    // A malformed cache entry must not prevent the deterministic fallback.
  }

  const payload = input.fallback();
  const aiRunId = await recordSafely(input.runStore, {
    feature: input.feature,
    inputHash: input.inputHash,
    promptVersion: input.promptVersion,
    model: input.completionClient ? input.model : null,
    status: "fallback",
    latencyMs: Date.now() - startedAt,
    outputJson: payload,
  });
  return { payload, source: "fallback", aiRunId };
}

/**
 * Safe deterministic help when vision is unavailable, unreadable, or returns
 * content outside the low-stakes tutoring boundary. It intentionally does not
 * identify an answer or transcribe the learner's work.
 */
export function getWorkAnalysisFallback(imageDataUrl?: string) {
  return {
    observation: imageDataUrl
      ? "I could not reliably read enough of the photo to give a specific correction."
      : "Start with one fraction step you can check before combining anything.",
    nextStep: "Write one equivalent-fraction or common-denominator step, then compare it with the original problem.",
    checkQuestion: "What value must stay the same when you rewrite a fraction?",
    imageRead: imageDataUrl ? "unclear" as const : "not_provided" as const,
  };
}

/**
 * ai_runs gets a one-way cache key only. Never pass raw typed work or a data
 * URL into this hash object, because the record must not retain either value.
 */
function workAnalysisInputHash(input: AnalyzeWorkInput): string {
  return hashInput({
    studentIdHash: hashInput(input.studentId),
    item: input.item,
    writtenWorkHash: hashInput(input.writtenWork),
    imageHash: input.imageDataUrl ? hashInput(input.imageDataUrl) : null,
    protectedAnswerHashes: input.protectedAnswers.map(hashInput),
    protectedSolutionStepHashes: input.protectedSolutionSteps.map(hashInput),
    promptVersion: input.promptVersion,
  });
}

function containsWorkAnalysisLeak(
  payload: z.infer<typeof workAnalysisPayloadSchema>,
  input: Pick<AnalyzeWorkInput, "protectedAnswers" | "protectedSolutionSteps">,
): boolean {
  return [payload.observation, payload.nextStep, payload.checkQuestion].some((text) =>
    containsGenericTutorLeak(text)
    || containsAnswerLeak(text, input.protectedAnswers, input.protectedSolutionSteps)
    || containsStandaloneProtectedAnswer(text, input.protectedAnswers),
  );
}

/**
 * The shared guard intentionally ignores values shorter than three characters
 * to avoid broad false positives in generic hints. Work analysis has the full
 * protected answer list, so it adds a stricter standalone-token check for
 * answers such as `12` while avoiding matches inside `112`, `12/5`, or `0.12`.
 */
function containsStandaloneProtectedAnswer(text: string, protectedAnswers: readonly string[]): boolean {
  const candidate = text.toLowerCase();

  return protectedAnswers.some((answer) => {
    const protectedAnswer = answer.trim().replace(/\s/g, "").toLowerCase();
    if (!protectedAnswer) return false;

    let startIndex = 0;
    while (startIndex < candidate.length) {
      const index = candidate.indexOf(protectedAnswer, startIndex);
      if (index < 0) return false;

      const before = candidate[index - 1];
      const after = candidate[index + protectedAnswer.length];
      const beforeIsDecimal = before === ".";
      const afterIsDecimal = after === "." && /\d/.test(candidate[index + protectedAnswer.length + 1] ?? "");
      const beforeIsBoundary = !before || (!/[0-9a-z/]/i.test(before) && !beforeIsDecimal);
      const afterIsBoundary = !after || (!/[0-9a-z/]/i.test(after) && !afterIsDecimal);

      if (beforeIsBoundary && afterIsBoundary) return true;
      startIndex = index + protectedAnswer.length;
    }

    return false;
  });
}

/** Creates the adapter used by domain code. It is server-only by construction. */
export function createAiAdapter(options: AiAdapterOptions = {}): RungAiAdapter {
  const completionClient = options.completionClient === undefined
    ? createConfiguredCompletionClient()
    : options.completionClient;
  const runStore = options.runStore ?? createRuntimeAiRunStore();
  const models = options.models ?? readModelConfig();

  return {
    async diagnoseExplanation(input) {
      const supportedTags = new Set(input.supportedMisconceptionTags);
      const selectedFallbackTag = input.supportedMisconceptionTags.find((tag) => getMayaDiagnosisContent(tag))
        ?? (supportedTags.has(mayaDiagnosisFallback.misconceptionTag)
          ? mayaDiagnosisFallback.misconceptionTag
          : input.supportedMisconceptionTags[0] ?? "unsupported_tag");
      const selectedFallbackContent = getMayaDiagnosisContent(selectedFallbackTag);
      const result = await resolveStructuredPayload({
        feature: "diagnosis_explanation",
        promptVersion: input.promptVersion,
        inputHash: hashInput(input),
        model: modelFor("diagnosis_explanation", models),
        schema: diagnosisPayloadSchema,
        completionClient,
        runStore,
        request: {
          schemaName: "diagnosis_explanation",
          system: "You explain a diagnosed middle-school fraction misconception. Use only the supplied misconception tags and never grade or change mastery.",
          user: JSON.stringify({
            gradeBand: input.gradeBand,
            targetSubskillId: input.targetSubskillId,
            supportedMisconceptionTags: input.supportedMisconceptionTags,
            evidence: input.evidence,
          }),
        },
        validate: (payload) => {
          if (!supportedTags.has(payload.misconceptionTag)) {
            throw new Error("Diagnosis used a tag outside the deterministic evidence set.");
          }
        },
        fallback: () => ({
          misconceptionTag: selectedFallbackTag,
          observation: selectedFallbackContent?.observation ?? mayaDiagnosisFallback.observation,
          explanation: selectedFallbackContent?.explanation ?? mayaDiagnosisFallback.explanation,
          nextStep: selectedFallbackContent?.nextStep ?? mayaDiagnosisFallback.nextStep,
        }),
      });

      return {
        ...result.payload,
        source: result.source,
        promptVersion: input.promptVersion,
        aiRunId: result.aiRunId,
      } satisfies DiagnosisExplanation;
    },

    async tutorHint(input) {
      const result = await resolveStructuredPayload({
        feature: "tutor_hint",
        promptVersion: input.promptVersion,
        inputHash: hashInput(input),
        model: modelFor("tutor_hint", models),
        schema: tutorPayloadSchema,
        completionClient,
        runStore,
        request: {
          schemaName: "tutor_hint",
          system: `You are a safe middle-school math tutor. Return one ${input.level} hint. Do not state a final answer, do not give a worked solution, and do not claim whether the learner is correct.`,
          user: JSON.stringify({ item: input.item, learnerAttempt: input.attempt, level: input.level }),
        },
        validate: (payload) => {
          if (containsGenericTutorLeak(payload.hint)) {
            throw new Error("Tutor hint contained a direct-answer signal.");
          }
        },
        fallback: () => ({ hint: getTutorHintFallback(input.item.id, input.level).hint }),
      });

      return {
        level: input.level,
        hint: result.payload.hint,
        source: result.source,
        promptVersion: input.promptVersion,
        aiRunId: result.aiRunId,
        leakCheck: result.source === "fallback" ? "fallback" : "passed",
      } satisfies TutorHint;
    },

    async verifyAttempt(input) {
      const result = await resolveStructuredPayload({
        feature: "attempt_verification",
        promptVersion: input.promptVersion,
        inputHash: hashInput(input),
        model: modelFor("attempt_verification", models),
        schema: attemptPayloadSchema,
        completionClient,
        runStore,
        request: {
          schemaName: "attempt_verification",
          system: "Verify only whether a learner attempt is on-topic and non-trivial. Do not score the math, unlock content, or infer mastery.",
          user: JSON.stringify({ item: input.item, attemptText: input.attemptText, explanation: input.explanation }),
        },
        // No-cache/no-live verification is deliberately fail-closed below.
        fallback: () => ({
          onTopic: false,
          nonTrivial: false,
          reason: attemptVerificationFallback.reason,
          confidence: 0,
        }),
      });

      return {
        ...result.payload,
        source: result.source,
        promptVersion: input.promptVersion,
        aiRunId: result.aiRunId,
      } satisfies AttemptVerification;
    },

    async generatePracticePlan(input) {
      const operationFallbackItems = [
        { kind: "fraction_operation" as const, operation: "add" as const, leftNumerator: 1, leftDenominator: 3, rightNumerator: 1, rightDenominator: 4 },
        { kind: "fraction_operation" as const, operation: "add" as const, leftNumerator: 2, leftDenominator: 5, rightNumerator: 1, rightDenominator: 3 },
        { kind: "fraction_operation" as const, operation: "subtract" as const, leftNumerator: 3, leftDenominator: 4, rightNumerator: 1, rightDenominator: 3 },
        { kind: "fraction_operation" as const, operation: "add" as const, leftNumerator: 3, leftDenominator: 8, rightNumerator: 1, rightDenominator: 6 },
      ];
      const fallbackItems = input.targetSubskillId === "fraction-number-line"
        ? [{ kind: "number_line" as const, numerator: 1, denominator: 2 }, { kind: "number_line" as const, numerator: 2, denominator: 3 }, { kind: "number_line" as const, numerator: 3, denominator: 4 }]
        : input.targetSubskillId === "equivalent-fractions"
          ? [{ kind: "equivalent_fraction" as const, numerator: 1, denominator: 3, multiplier: 2 }, { kind: "equivalent_fraction" as const, numerator: 2, denominator: 5, multiplier: 3 }, { kind: "equivalent_fraction" as const, numerator: 3, denominator: 4, multiplier: 2 }]
          : input.targetSubskillId === "find-common-denominator"
            ? [{ kind: "common_denominator" as const, leftDenominator: 3, rightDenominator: 4 }, { kind: "common_denominator" as const, leftDenominator: 4, rightDenominator: 5 }, { kind: "common_denominator" as const, leftDenominator: 3, rightDenominator: 5 }]
            : operationFallbackItems;
      const result = await resolveStructuredPayload({
        feature: "practice_plan", promptVersion: input.promptVersion, inputHash: hashInput(input), model: modelFor("practice_plan", models), schema: practicePlanPayloadSchema, completionClient, runStore,
        request: {
          schemaName: "practice_plan",
          system: "Create 3 or 4 middle-school fraction practice items for the diagnosed target skill. Use number_line for fraction-number-line, equivalent_fraction for equivalent-fractions, common_denominator for find-common-denominator, and fraction_operation (with unlike denominators) for addition or subtraction skills. Return only the schema; never include answers, solutions, or explanations.",
          user: JSON.stringify({ targetSubskillId: input.targetSubskillId, misconceptionTags: input.misconceptionTags }),
        },
        validate: (payload) => {
          const expected = input.targetSubskillId === "fraction-number-line" ? "number_line" : input.targetSubskillId === "equivalent-fractions" ? "equivalent_fraction" : input.targetSubskillId === "find-common-denominator" ? "common_denominator" : "fraction_operation";
          if (!payload.items.every((item) => item.kind === expected)) throw new Error("Practice plan did not match its diagnosed skill.");
          if (expected === "fraction_operation" && payload.items.some((item) => item.kind === "fraction_operation" && item.leftDenominator === item.rightDenominator)) throw new Error("Fraction-operation plan used equal denominators.");
        },
        fallback: () => ({ items: fallbackItems }),
      });
      return { items: result.payload.items, source: result.source, promptVersion: input.promptVersion, aiRunId: result.aiRunId } satisfies GeneratedPracticePlan;
    },

    async analyzeWork(rawInput) {
      const input = analyzeWorkInputSchema.parse(rawInput);
      const result = await resolveStructuredPayload({
        feature: "work_analysis",
        promptVersion: input.promptVersion,
        inputHash: workAnalysisInputHash(input),
        model: modelFor("work_analysis", models),
        schema: workAnalysisPayloadSchema,
        completionClient,
        runStore,
        request: {
          schemaName: "work_analysis",
          system: [
            "You are a careful middle-school fraction coach helping after a learner is still stuck.",
            "This is low-stakes work analysis only; never score the work, unlock content, infer mastery, or claim whether an answer is correct.",
            "Return a concise observation, one next step, one check question, and imageRead (not_provided, readable, or unclear).",
            "Do not state a final answer, complete a calculation, provide a worked solution, or reveal an answer key.",
            "Do not transcribe, quote, or repeat the learner's typed or handwritten work. Describe a pattern instead.",
            "Use supportive, plain language and focus on one actionable next move. If the image is not readable, set imageRead to unclear.",
          ].join(" "),
          user: JSON.stringify({
            item: input.item,
            writtenWork: input.writtenWork,
            imageIncluded: Boolean(input.imageDataUrl),
          }),
          imageDataUrl: input.imageDataUrl,
        },
        validate: (payload) => {
          if (!input.imageDataUrl && payload.imageRead !== "not_provided") {
            throw new Error("Work analysis reported an image state without an image.");
          }
          if (input.imageDataUrl && payload.imageRead === "not_provided") {
            throw new Error("Work analysis did not report a supplied image state.");
          }
          if (containsWorkAnalysisLeak(payload, input)) {
            throw new Error("Work analysis contained protected-answer or tutor leakage.");
          }
        },
        fallback: () => getWorkAnalysisFallback(input.imageDataUrl),
      });

      return {
        ...result.payload,
        source: result.source,
        promptVersion: input.promptVersion,
        aiRunId: result.aiRunId,
        leakCheck: result.source === "fallback" ? "fallback" : "passed",
      } satisfies WorkAnalysis;
    },

    async wrapItem(input) {
      const result = await resolveStructuredPayload({
        feature: "item_wrap",
        promptVersion: input.promptVersion,
        inputHash: hashInput(input),
        model: modelFor("item_wrap", models),
        schema: itemWrapPayloadSchema,
        completionClient,
        runStore,
        request: {
          schemaName: "item_wrap",
          system: "Rewrite the learner-facing wording only. Preserve every number, operation, and mathematical task. Return no answer or explanation.",
          user: JSON.stringify({
            itemId: input.item.id,
            subskillId: input.item.subskillId,
            difficulty: input.item.difficulty,
            prompt: input.item.prompt,
          }),
        },
        fallback: () => ({ prompt: input.item.prompt }),
      });

      return {
        itemId: input.item.id,
        prompt: result.payload.prompt,
        source: result.source,
        promptVersion: input.promptVersion,
        aiRunId: result.aiRunId,
      } satisfies ItemWrap;
    },
  };
}

/** Keeps live API configuration out of components and route handlers. */
export function createConfiguredCompletionClient(): StructuredCompletionClient | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 15_000 });
  return {
    async complete(input) {
      // Chat Completions supports a base64 image data URL alongside text. The
      // image lives only in this request; it is never copied into ai_runs.
      const userContent = input.imageDataUrl
        ? [
          { type: "text" as const, text: input.user },
          { type: "image_url" as const, image_url: { url: input.imageDataUrl, detail: "high" as const } },
        ]
        : input.user;
      const completion = await client.beta.chat.completions.parse({
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: userContent },
        ],
        response_format: zodResponseFormat(input.schema, input.schemaName),
      });
      const parsed = completion.choices[0]?.message.parsed;
      if (!parsed) throw new Error("OpenAI returned no structured response.");
      return parsed;
    },
  };
}

export function readModelConfig(env: NodeJS.ProcessEnv = process.env): AiModelConfig {
  return {
    defaultModel: env.OPENAI_MODEL ?? DEFAULT_AI_MODEL,
    diagnosis_explanation: env.OPENAI_MODEL_DIAGNOSIS,
    tutor_hint: env.OPENAI_MODEL_TUTOR_HINT,
    attempt_verification: env.OPENAI_MODEL_ATTEMPT_VERIFICATION,
    work_analysis: env.OPENAI_MODEL_WORK_ANALYSIS,
    practice_plan: env.OPENAI_MODEL_PRACTICE_PLAN,
    item_wrap: env.OPENAI_MODEL_ITEM_WRAP,
  };
}

export function modelFor(feature: AiFeature, models: AiModelConfig): string {
  // `.env.local` commonly contains empty optional overrides. Treat those the
  // same as an unset value: passing an empty model name makes the provider
  // reject the request and silently sends the learner to the fixed fallback.
  return models[feature]?.trim() || models.defaultModel?.trim() || DEFAULT_AI_MODEL;
}

export function hashInput(input: unknown): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function recordSafely(store: AiRunStore, record: AiRunRecord): Promise<string> {
  try {
    return await store.record(record);
  } catch {
    return `memory-unlogged-${record.feature}-${Date.now()}`;
  }
}

class InMemoryAiRunStore implements AiRunStore {
  private readonly records: Array<AiRunRecord & { id: string }> = [];
  private sequence = 0;

  async findValid(input: AiRunLookup): Promise<unknown | null> {
    const match = [...this.records].reverse().find((record) =>
      record.status === "valid"
      && record.feature === input.feature
      && record.inputHash === input.inputHash
      && record.promptVersion === input.promptVersion,
    );
    return match?.outputJson ?? null;
  }

  async record(input: AiRunRecord): Promise<string> {
    const id = `memory-ai-run-${++this.sequence}`;
    this.records.push({ ...input, id });
    return id;
  }
}

class SupabaseAiRunStore implements AiRunStore {
  private readonly client = createServerSupabaseClient();

  async findValid(input: AiRunLookup): Promise<unknown | null> {
    const { data, error } = await this.client
      .from("ai_runs")
      .select("output_json")
      .eq("feature", input.feature)
      .eq("input_hash", input.inputHash)
      .eq("prompt_version", input.promptVersion)
      .eq("status", "valid")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return (data?.[0] as { output_json?: unknown } | undefined)?.output_json ?? null;
  }

  async record(input: AiRunRecord): Promise<string> {
    const { data, error } = await this.client
      .from("ai_runs")
      .insert({
        feature: input.feature,
        input_hash: input.inputHash,
        prompt_version: input.promptVersion,
        model: input.model,
        status: input.status,
        latency_ms: input.latencyMs,
        output_json: input.outputJson,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = (data as { id?: string } | null)?.id;
    if (!id) throw new Error("Supabase did not return an ai_runs ID.");
    return id;
  }
}

class ResilientAiRunStore implements AiRunStore {
  private readonly memory = new InMemoryAiRunStore();
  private readonly persistent = hasSupabaseCredentials() ? new SupabaseAiRunStore() : null;

  async findValid(input: AiRunLookup): Promise<unknown | null> {
    if (this.persistent) {
      try {
        const cached = await this.persistent.findValid(input);
        if (cached !== null) return cached;
      } catch {
        // The in-memory cache keeps a demo request working during a transient DB failure.
      }
    }
    return this.memory.findValid(input);
  }

  async record(input: AiRunRecord): Promise<string> {
    const memoryId = await this.memory.record(input);
    if (!this.persistent) return memoryId;
    try {
      return await this.persistent.record(input);
    } catch {
      return memoryId;
    }
  }
}

function hasSupabaseCredentials(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function createRuntimeAiRunStore(): AiRunStore {
  return new ResilientAiRunStore();
}

export const runtimeAiAdapter: RungAiAdapter = createAiAdapter();
