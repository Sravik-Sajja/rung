import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  analyzeWorkInputSchema,
  generatedPracticePlanSchema,
  hasValidTeacherLessonDuration,
  teacherLessonDraftSchema,
  tutorHintInputSchema
} from "@/lib/ai/contracts";
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
  TutorHintInput,
  TutorHint,
  WorkAnalysis,
  GeneratedPracticePlan,
  TeacherLessonDraft,
} from "@/lib/ai/contracts";
import { attemptVerificationFallback, getTutorHintFallback, mayaDiagnosisFallback } from "@/lib/ai/fixtures";
import { getMayaDiagnosisContent } from "@/lib/content/maya-fractions";
import { containsAnswerLeak, containsGenericTutorLeak, containsTutorHintLeak } from "@/lib/ai/leakage";
import { generatedPracticePlanFallback, validateGeneratedPracticePlan } from "@/lib/items/generated-practice-plan";

export type AiFeature = "diagnosis_explanation" | "tutor_hint" | "attempt_verification" | "work_analysis" | "practice_plan" | "teacher_lesson" | "item_wrap";
export type AiRunStatus = "valid" | "live_failed" | "cache_hit" | "fallback";

export const DEFAULT_AI_MODEL = "gpt-5.6-luna";

export interface AiModelConfig {
  defaultModel?: string;
  diagnosis_explanation?: string;
  tutor_hint?: string;
  attempt_verification?: string;
  work_analysis?: string;
  practice_plan?: string;
  teacher_lesson?: string;
  item_wrap?: string;
}

/**
 * `live_first` is architecture.md §6's original order: call the model, and treat
 * a verified cache entry only as an outage net. `cache_first` serves a verified
 * entry without calling the model at all.
 *
 * Cache-first is correct only where the output is a pure function of the cache
 * key, so a stored entry is indistinguishable from a fresh call. Where a hit
 * would be a coincidence (work analysis) or a stale decision would be unsafe
 * (attempt verification), live-first stays.
 */
export type AiCacheMode = "cache_first" | "live_first";

export type AiCacheConfig = Partial<Record<AiFeature, AiCacheMode>> & { defaultMode?: AiCacheMode };

export const DEFAULT_AI_CACHE_MODES: Readonly<Record<AiFeature, AiCacheMode>> = {
  // A hint is a pure function of item, attempt, and level. Two learners who make
  // the same mistake on the same item deserve the same hint, so a repeat is
  // identical work and the model does not belong on that path.
  tutor_hint: "cache_first",
  // The same deterministic evidence renders the same explanation.
  diagnosis_explanation: "cache_first",
  // architecture.md §9.4 already specifies cache-first for the group plan.
  teacher_lesson: "cache_first",
  // Keyed by the learner's own typed work, so a hit means one learner resubmitted
  // identical text. There is no reuse to win, and serving one learner's coaching
  // to another is a boundary worth keeping shut.
  work_analysis: "live_first",
  // Fail-closed by design (§9.3). A cached unlock decision must never stand in
  // for a fresh one.
  attempt_verification: "live_first",
  // Plans are keyed per learner and persisted downstream with their own
  // provenance; regenerating is cheap relative to serving a stale plan.
  practice_plan: "live_first",
  item_wrap: "live_first",
};

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
  cacheModes?: AiCacheConfig;
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
const teacherLessonPayloadSchema = teacherLessonDraftSchema.omit({ source: true, promptVersion: true, aiRunId: true });

type ResolvedPayload<Payload> = { payload: Payload; source: AiSource; aiRunId: string };

/**
 * Runs a structured response with a demo-safe priority order. A `live_first`
 * feature calls the model, then falls back to a verified cache entry, then to a
 * deterministic fixture. A `cache_first` feature checks the cache before
 * spending a model call, but is otherwise identical.
 *
 * Every cached payload is re-parsed and re-validated on the way out, so an entry
 * that was safe when stored cannot bypass a leak check that has since tightened.
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
  cacheMode: AiCacheMode;
  fallback: () => Payload;
  validate?: (payload: Payload) => void;
}): Promise<ResolvedPayload<Payload>> {
  const startedAt = Date.now();

  const readCache = async (): Promise<ResolvedPayload<Payload> | null> => {
    try {
      const cached = await input.runStore.findValid({
        feature: input.feature,
        inputHash: input.inputHash,
        promptVersion: input.promptVersion,
      });
      if (cached === null) return null;
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
    } catch {
      // A malformed or now-unsafe cache entry must never block the live call or
      // the deterministic fallback.
      return null;
    }
  };

  const cacheFirst = input.cacheMode === "cache_first";
  if (cacheFirst) {
    const hit = await readCache();
    if (hit) return hit;
  }

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

  // A cache-first feature already missed above; looking again would only repeat
  // the same query for the same answer.
  if (!cacheFirst) {
    const hit = await readCache();
    if (hit) return hit;
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
    protectedAnswerRuleHash: input.protectedAnswerRule ? hashInput(input.protectedAnswerRule) : null,
    protectedSolutionStepHashes: input.protectedSolutionSteps.map(hashInput),
    promptVersion: input.promptVersion,
  });
}

/**
 * The key covers exactly what the model is asked, and nothing else.
 *
 * studentId is deliberately absent. A hint is a function of the item, the
 * attempt, and the level — identity does not change a single word of it — so
 * keying on the learner would fragment the cache one entry per person and
 * guarantee that a class making the same mistake never reuses anything.
 *
 * Tutor protection is absent for a different reason: it is used only to reject
 * output, never to influence a model request, cache payload, or ai_runs record.
 */
function tutorHintInputHash(input: TutorHintInput): string {
  return hashInput({
    item: input.item,
    learnerAttempt: input.attempt,
    level: input.level,
    promptVersion: input.promptVersion,
  });
}

/**
 * Keyed on the deterministic evidence the model actually receives. studentId and
 * assignmentId are excluded for the same reason as the tutor key: two learners
 * with identical evidence get an identical explanation, and keying on identity
 * would mean neither could ever reuse the other's.
 */
function diagnosisInputHash(input: {
  gradeBand: string;
  targetSubskillId: string;
  supportedMisconceptionTags: string[];
  evidence: unknown;
  promptVersion: string;
}): string {
  return hashInput({
    gradeBand: input.gradeBand,
    targetSubskillId: input.targetSubskillId,
    supportedMisconceptionTags: input.supportedMisconceptionTags,
    evidence: input.evidence,
    promptVersion: input.promptVersion,
  });
}

function containsWorkAnalysisLeak(
  payload: z.infer<typeof workAnalysisPayloadSchema>,
  input: Pick<AnalyzeWorkInput, "protectedAnswers" | "protectedAnswerRule" | "protectedSolutionSteps">,
): boolean {
  return [payload.observation, payload.nextStep, payload.checkQuestion].some((text) =>
    containsGenericTutorLeak(text)
    || containsAnswerLeak(text, input.protectedAnswers, input.protectedSolutionSteps, input.protectedAnswerRule)
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
  const cacheModes = options.cacheModes ?? readAiCacheConfig();

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
        inputHash: diagnosisInputHash(input),
        model: modelFor("diagnosis_explanation", models),
        schema: diagnosisPayloadSchema,
        completionClient,
        runStore,
        cacheMode: cacheModeFor("diagnosis_explanation", cacheModes),
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

    async tutorHint(rawInput) {
      const input = tutorHintInputSchema.parse(rawInput);
      const result = await resolveStructuredPayload({
        feature: "tutor_hint",
        promptVersion: input.promptVersion,
        inputHash: tutorHintInputHash(input),
        model: modelFor("tutor_hint", models),
        schema: tutorPayloadSchema,
        completionClient,
        runStore,
        cacheMode: cacheModeFor("tutor_hint", cacheModes),
        request: {
          schemaName: "tutor_hint",
          system: `You are a safe middle-school math tutor. Return exactly one ${input.level} support message; never combine levels.

          Nudge: one reflective question, maximum 18 words. Redirect attention to information already visible in the problem. Do not name a strategy, rule, tool, or procedure.

          Hint: one declarative insight, maximum 24 words. Explicitly name the relevant strategy, representation, or rule, but do not tell the learner what to do first, second, or next.

          Guided step: exactly one imperative action, maximum 24 words. Tell the learner one concrete thing to write, draw, identify, or calculate now. Never include a second action, a completed calculation, or the final answer.

          Do not state a final answer, give a worked solution, or claim whether the learner is correct.`,
          user: JSON.stringify({ item: input.item, learnerAttempt: input.attempt, level: input.level }),
        },
        validate: (payload) => {
          if (containsTutorHintLeak(payload.hint, input.protection)) {
            throw new Error("Tutor hint contained protected-answer or solution leakage.");
          }
        },
        fallback: () => ({ hint: getTutorHintFallback(input.item, input.level).hint }),
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
        cacheMode: cacheModeFor("attempt_verification", cacheModes),
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
      const result = await resolveStructuredPayload({
        feature: "practice_plan", promptVersion: input.promptVersion, inputHash: hashInput(input), model: modelFor("practice_plan", models), schema: practicePlanPayloadSchema, completionClient, runStore,
        cacheMode: cacheModeFor("practice_plan", cacheModes),
        request: {
          schemaName: "practice_plan",
          system: "Create 3 or 4 middle-school fraction practice items for the diagnosed target skill. Use number_line for fraction-number-line, equivalent_fraction for equivalent-fractions, common_denominator for find-common-denominator, and fraction_operation (with unlike denominators) for addition or subtraction skills. Return only the schema; never include answers, solutions, or explanations.",
          user: JSON.stringify({ targetSubskillId: input.targetSubskillId, misconceptionTags: input.misconceptionTags }),
        },
        validate: (payload) => {
          validateGeneratedPracticePlan({ targetSubskillId: input.targetSubskillId, items: payload.items });
        },
        fallback: () => ({ items: generatedPracticePlanFallback(input.targetSubskillId) }),
      });
      return { items: result.payload.items, source: result.source, promptVersion: input.promptVersion, aiRunId: result.aiRunId } satisfies GeneratedPracticePlan;
    },

    async generateTeacherLessonDraft(input) {
      const result = await resolveStructuredPayload({
        feature: "teacher_lesson",
        promptVersion: input.promptVersion,
        inputHash: hashInput(input),
        model: modelFor("teacher_lesson", models),
        schema: teacherLessonPayloadSchema,
        completionClient,
        runStore,
        cacheMode: cacheModeFor("teacher_lesson", cacheModes),
        request: {
          schemaName: "teacher_lesson",
          system: [
            "Draft a concise 15–20 minute middle-school small-group lesson.",
            "Use the supplied group skill, student count, and assigned-practice count only.",
            "Return a practical sequence: warm-up, teacher model, guided work, assigned practice, then exit check.",
            "Each activity must be one short, concrete teacher instruction under 200 characters; do not use compound sentences.",
            "Assume only pencil and paper are available; do not require manipulatives, printed cards, whiteboards, or technology.",
            "List only pencil and paper in materials.",
            "Refer to the assigned practice only as 'matched practice cards'—do not quote or repeat problem prompts.",
            "Return an objective, materials, 3–5 timed steps, and one more challenging check-for-understanding.",
            "Do not name students, invent evidence, provide answer keys, or write a completed solution.",
          ].join(" "),
          user: JSON.stringify(input),
        },
        validate: (payload) => {
          if (!hasValidTeacherLessonDuration(payload.steps)) {
            throw new Error("Teacher lesson steps must total 15–20 minutes.");
          }
        },
        fallback: () => ({
          objective: `Strengthen ${input.subskillName} through a short model-and-practice lesson.`,
          materials: ["Pencil", "Paper"],
          steps: [
            { minutes: 3, activity: `Warm up: name the key feature of ${input.subskillName}.` },
            { minutes: 6, activity: "Model one example and narrate each decision." },
            { minutes: 7, activity: "Pairs solve the matched practice problems and compare methods." },
            { minutes: 3, activity: "Independently solve one matched practice problem." },
          ],
          checkForUnderstanding: "Ask each learner to justify the method used on the final card.",
        }),
      });
      return { ...result.payload, source: result.source, promptVersion: input.promptVersion, aiRunId: result.aiRunId } satisfies TeacherLessonDraft;
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
        cacheMode: cacheModeFor("work_analysis", cacheModes),
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
        cacheMode: cacheModeFor("item_wrap", cacheModes),
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
    teacher_lesson: env.OPENAI_MODEL_TEACHER_LESSON,
    item_wrap: env.OPENAI_MODEL_ITEM_WRAP,
  };
}

export function modelFor(feature: AiFeature, models: AiModelConfig): string {
  // `.env.local` commonly contains empty optional overrides. Treat those the
  // same as an unset value: passing an empty model name makes the provider
  // reject the request and silently sends the learner to the fixed fallback.
  return models[feature]?.trim() || models.defaultModel?.trim() || DEFAULT_AI_MODEL;
}

/**
 * An unrecognised or blank value is ignored rather than defaulted, so a typo in
 * `.env.local` cannot silently move a feature off the order chosen in
 * DEFAULT_AI_CACHE_MODES.
 */
function parseCacheMode(value: string | undefined): AiCacheMode | undefined {
  const normalized = value?.trim().toLowerCase();
  return (["cache_first", "live_first"] as const).find((mode) => mode === normalized);
}

export function readAiCacheConfig(env: NodeJS.ProcessEnv = process.env): AiCacheConfig {
  return {
    defaultMode: parseCacheMode(env.OPENAI_CACHE_MODE),
    diagnosis_explanation: parseCacheMode(env.OPENAI_CACHE_MODE_DIAGNOSIS),
    tutor_hint: parseCacheMode(env.OPENAI_CACHE_MODE_TUTOR_HINT),
    attempt_verification: parseCacheMode(env.OPENAI_CACHE_MODE_ATTEMPT_VERIFICATION),
    work_analysis: parseCacheMode(env.OPENAI_CACHE_MODE_WORK_ANALYSIS),
    practice_plan: parseCacheMode(env.OPENAI_CACHE_MODE_PRACTICE_PLAN),
    teacher_lesson: parseCacheMode(env.OPENAI_CACHE_MODE_TEACHER_LESSON),
    item_wrap: parseCacheMode(env.OPENAI_CACHE_MODE_ITEM_WRAP),
  };
}

/** A per-feature override wins over a global one, which wins over the built-in default. */
export function cacheModeFor(feature: AiFeature, config: AiCacheConfig): AiCacheMode {
  return config[feature] ?? config.defaultMode ?? DEFAULT_AI_CACHE_MODES[feature];
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
