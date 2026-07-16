import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AiSource,
  AttemptVerification,
  DiagnosisExplanation,
  HintLevel,
  ItemWrap,
  ParametricItem,
  RungAiAdapter,
  SafeItem,
  TutorHint,
} from "@/lib/ai/contracts";
import { attemptVerificationFallback, getTutorHintFallback, mayaDiagnosisFallback } from "@/lib/ai/fixtures";
import { getMayaDiagnosisContent } from "@/lib/content/maya-fractions";
import { containsGenericTutorLeak } from "@/lib/ai/leakage";

export type AiFeature = "diagnosis_explanation" | "tutor_hint" | "attempt_verification" | "item_wrap";
export type AiRunStatus = "valid" | "live_failed" | "cache_hit" | "fallback";

export const DEFAULT_AI_MODEL = "gpt-5.6-luna";

export interface AiModelConfig {
  defaultModel?: string;
  diagnosis_explanation?: string;
  tutor_hint?: string;
  attempt_verification?: string;
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

const itemWrapPayloadSchema = z.object({ prompt: z.string().min(1) });

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
      const completion = await client.beta.chat.completions.parse({
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
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
    item_wrap: env.OPENAI_MODEL_ITEM_WRAP,
  };
}

export function modelFor(feature: AiFeature, models: AiModelConfig): string {
  return models[feature] ?? models.defaultModel ?? DEFAULT_AI_MODEL;
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
