import { NextResponse } from "next/server";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { getTutorHintProtection } from "@/lib/ai/fixtures";
import { requireStudentActor } from "@/lib/auth/actor";
import {
  claimPracticeWorkHelp,
  releasePracticeWorkHelpClaim,
  resolvePracticeSupportItem,
  type ResolvedPracticeSupport,
} from "@/lib/student/practice-support";
import type { Item } from "@/lib/types";
import { workHelpFormSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Text fields and multipart framing are allowed a small amount of room beyond
// the image limit. The file itself is still checked after parsing.
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ImageResult =
  | { dataUrl?: string }
  | { error: string; status: 400 | 413 | 415 };

/**
 * Reads a submitted image only long enough to hand it to the AI boundary. The
 * result is deliberately never written to disk, Supabase, an ai_run, or the
 * response body.
 */
async function readOptionalImage(value: FormDataEntryValue | null): Promise<ImageResult> {
  if (value === null) return {};
  if (typeof value === "string" || typeof value.arrayBuffer !== "function") {
    return { error: "Photo must be uploaded as an image file.", status: 400 };
  }

  const contentType = value.type.toLowerCase();
  if (!allowedImageTypes.has(contentType)) {
    return { error: "Photo must be a JPEG, PNG, or WebP image.", status: 415 };
  }
  if (value.size === 0) return { error: "Photo file is empty.", status: 400 };
  if (value.size > MAX_IMAGE_BYTES) {
    return { error: "Photo must be 5 MB or smaller.", status: 413 };
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  if (!hasExpectedImageSignature(bytes, contentType)) {
    return { error: "Photo contents do not match a JPEG, PNG, or WebP image.", status: 415 };
  }

  return { dataUrl: `data:${contentType};base64,${bytes.toString("base64")}` };
}

function hasExpectedImageSignature(bytes: Buffer, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
  }
  // A WebP image has a RIFF container with WEBP in its format marker.
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Photo must be 5 MB or smaller." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send your work as a valid form submission." }, { status: 400 });
  }

  const rawForm: Record<string, FormDataEntryValue | undefined> = {
    studentId: formData.get("studentId") ?? undefined,
    itemId: formData.get("itemId") ?? undefined,
    writtenWork: formData.get("writtenWork") ?? undefined,
    supportLevel: formData.get("supportLevel") ?? undefined,
  };
  const practiceSessionId = formData.get("practiceSessionId");
  const practiceSessionItemId = formData.get("practiceSessionItemId");
  if (practiceSessionId !== null) rawForm.practiceSessionId = practiceSessionId;
  if (practiceSessionItemId !== null) rawForm.practiceSessionItemId = practiceSessionItemId;

  const parsed = workHelpFormSchema.safeParse(rawForm);
  if (!parsed.success) {
    return NextResponse.json({ error: "Add a short explanation of what you tried, then try again." }, { status: 400 });
  }

  // Authorize before resolving item content. Generated items are deliberately
  // unavailable unless the request identifies an owned session occurrence.
  let actor: Awaited<ReturnType<typeof requireStudentActor>>;
  try {
    actor = await requireStudentActor(request, parsed.data.studentId);
  } catch {
    return NextResponse.json({ error: "You cannot request help for this learner." }, { status: 403 });
  }

  let item: Item;
  let resolvedSupport: ResolvedPracticeSupport | undefined;
  if ("practiceSessionId" in parsed.data) {
    const resolved = await resolvePracticeSupportItem({
      studentId: actor.studentId,
      practiceSessionId: parsed.data.practiceSessionId,
      practiceSessionItemId: parsed.data.practiceSessionItemId,
      store: actor.store,
    });
    if (resolved.status === "forbidden") return NextResponse.json({ error: "You cannot request help for this practice session." }, { status: 403 });
    if (resolved.status === "not_found") return NextResponse.json({ error: "This practice session or item was not found." }, { status: 404 });
    if (resolved.status === "unavailable") return NextResponse.json({ error: "Practice support is unavailable right now." }, { status: 503 });
    item = resolved.item;
    resolvedSupport = resolved;
  } else {
    // Work-help is an earned escalation, so an old catalog-only payload may
    // not bypass the server-owned session/event boundary.
    return NextResponse.json({ error: "Record a practice attempt and hint in this session before asking for work-based help." }, { status: 409 });
  }

  if (!resolvedSupport) return NextResponse.json({ error: "Practice support is unavailable right now." }, { status: 503 });

  const image = await readOptionalImage(formData.get("photo"));
  if ("error" in image) return NextResponse.json({ error: image.error }, { status: image.status });

  // All request validation is complete before reserving the one eligible
  // response. The reservation prevents two concurrent tabs from consuming
  // the escalation twice, and is released if the adapter fails.
  let claimId: string;
  try {
    const claim = await claimPracticeWorkHelp({ resolution: resolvedSupport, studentId: actor.studentId });
    if (claim.status === "unavailable") return NextResponse.json({ error: "Practice support is unavailable right now." }, { status: 503 });
    if (claim.status === "ineligible") return NextResponse.json({ error: "Show your work becomes available after a missed answer, a hint, and one more try." }, { status: 409 });
    if (claim.status !== "claimed") return NextResponse.json({ error: "Practice support is unavailable right now." }, { status: 503 });
    claimId = claim.claimId;
  } catch {
    return NextResponse.json({ error: "We could not check work-help eligibility. Try again." }, { status: 503 });
  }

  const protection = getTutorHintProtection(item);
  // Persisted generated items carry their own validated solution steps. The
  // fallback map covers demo-only / older seeded rows that predate the column.
  const protectedSolutionSteps = resolvedSupport.solutionSteps.length
    ? resolvedSupport.solutionSteps
    : protection.protectedSolutionSteps;
  try {
    const help = await runtimeAiAdapter.analyzeWork({
      studentId: actor.studentId,
      item: {
        id: item.id,
        subskillId: item.subskillId,
        gradeBand: "6-8",
        prompt: item.prompt,
        difficulty: 1,
      },
      writtenWork: parsed.data.writtenWork,
      imageDataUrl: image.dataUrl,
      // These are protected context for the server-side safety boundary. They
      // are never returned by this route and are not used for scoring/unlocks.
      protectedAnswers: protection.protectedAnswers,
      protectedAnswerRule: protection.protectedAnswerRule,
      protectedSolutionSteps,
      promptVersion: `work-help-v1-${parsed.data.supportLevel}`,
    });

    return NextResponse.json({
      itemId: item.id,
      supportLevel: parsed.data.supportLevel,
      observation: help.observation,
      nextStep: help.nextStep,
      checkQuestion: help.checkQuestion,
      imageRead: help.imageRead,
      source: help.source,
      promptVersion: help.promptVersion,
      aiRunId: help.aiRunId,
      leakCheck: help.leakCheck,
    });
  } catch {
    try {
      await releasePracticeWorkHelpClaim({ resolution: resolvedSupport, studentId: actor.studentId, claimId });
    } catch {
      // The learner still receives a retry-safe error. We never store the
      // typed work or photo while attempting to release a reservation.
    }
    return NextResponse.json({ error: "We could not review your work right now. Try the next hint or try again shortly." }, { status: 500 });
  }
}
