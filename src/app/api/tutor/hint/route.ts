// Server-only tutor endpoint: validates hint requests and uses the safe AI adapter boundary.
import { NextResponse } from "next/server";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { getTutorHintProtection } from "@/lib/ai/fixtures";
import { demoItems } from "@/lib/demo-data";
import { requireStudentActor } from "@/lib/auth/actor";
import { recordPracticeSupportHint, resolvePracticeSupportItem, type ResolvedPracticeSupport } from "@/lib/student/practice-support";
import type { Item } from "@/lib/types";
import { hintSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const result = hintSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Invalid hint request" }, { status: 400 });

  // Authenticate before resolving any item. In particular, never look up a
  // generated item by global ID: it is valid only inside an owned occurrence.
  let actor: Awaited<ReturnType<typeof requireStudentActor>>;
  try {
    actor = await requireStudentActor(request, result.data.studentId);
  } catch {
    return NextResponse.json({ error: "You cannot request help for this learner." }, { status: 403 });
  }

  let item: Item;
  let resolvedSupport: ResolvedPracticeSupport | undefined;
  if ("practiceSessionId" in result.data) {
    const resolved = await resolvePracticeSupportItem({
      studentId: actor.studentId,
      practiceSessionId: result.data.practiceSessionId,
      practiceSessionItemId: result.data.practiceSessionItemId,
      store: actor.store,
    });
    if (resolved.status === "forbidden") return NextResponse.json({ error: "You cannot request help for this practice session." }, { status: 403 });
    if (resolved.status === "not_found") return NextResponse.json({ error: "This practice session or item was not found." }, { status: 404 });
    if (resolved.status === "unavailable") return NextResponse.json({ error: "Practice support is unavailable right now." }, { status: 503 });
    item = resolved.item;
    resolvedSupport = resolved;
  } else {
    // Temporary compatibility for old surfaces. It is restricted to the
    // fixed seeded practice catalog and can never expose generated content.
    const legacyItem = demoItems.find((candidate) => candidate.id === result.data.itemId);
    if (!legacyItem) return NextResponse.json({ error: "Unknown item" }, { status: 404 });
    item = legacyItem;
  }

  if (resolvedSupport) {
    try {
      const recorded = await recordPracticeSupportHint({
        resolution: resolvedSupport,
        studentId: actor.studentId,
        level: result.data.level,
      });
      if (recorded.status === "unavailable") return NextResponse.json({ error: "Practice support is unavailable right now." }, { status: 503 });
      if (recorded.status === "ineligible") return NextResponse.json({ error: "This is no longer the active practice item." }, { status: 409 });
    } catch {
      return NextResponse.json({ error: "We could not save this hint request. Try again." }, { status: 503 });
    }
  }

  const hint = await runtimeAiAdapter.tutorHint({
    studentId: actor.studentId,
    item: {
      id: item.id,
      subskillId: item.subskillId,
      gradeBand: "6-8",
      prompt: item.prompt,
      difficulty: 1,
    },
    attempt: result.data.attempt,
    level: result.data.level,
    promptVersion: "tutor-v1",
    // The adapter uses this only for post-generation/cached-output safety.
    // It never serializes the answer key or solution steps to the model.
    protection: getTutorHintProtection(item),
  });
  return NextResponse.json({ ...hint, itemId: item.id });
}
