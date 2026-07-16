import { NextResponse } from "next/server";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { requireStudentActor } from "@/lib/auth/actor";
import { mayaPracticeItemContent } from "@/lib/content/maya-fractions";
import { findDemoItem } from "@/lib/demo-data";
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

  const parsed = workHelpFormSchema.safeParse({
    studentId: formData.get("studentId"),
    itemId: formData.get("itemId"),
    writtenWork: formData.get("writtenWork"),
    supportLevel: formData.get("supportLevel"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Add a short explanation of what you tried, then try again." }, { status: 400 });
  }

  const item = findDemoItem(parsed.data.itemId);
  if (!item) return NextResponse.json({ error: "This practice item was not found." }, { status: 404 });

  try {
    await requireStudentActor(request, parsed.data.studentId);
  } catch {
    return NextResponse.json({ error: "You cannot request help for this learner." }, { status: 403 });
  }

  const image = await readOptionalImage(formData.get("photo"));
  if ("error" in image) return NextResponse.json({ error: image.error }, { status: image.status });

  const itemContent = mayaPracticeItemContent[item.id as keyof typeof mayaPracticeItemContent];
  try {
    const help = await runtimeAiAdapter.analyzeWork({
      studentId: parsed.data.studentId,
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
      protectedAnswers: [...item.answerSpec.accepted],
      protectedSolutionSteps: itemContent ? [...itemContent.solutionSteps] : [],
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
    return NextResponse.json({ error: "We could not review your work right now. Try the next hint or try again shortly." }, { status: 500 });
  }
}
