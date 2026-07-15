// Server-only tutor endpoint: validates hint requests and uses the safe AI adapter boundary.
import { NextResponse } from "next/server";
import { runtimeAiAdapter } from "@/lib/ai/adapter";
import { demoItems } from "@/lib/demo-data";
import { hintSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const result = hintSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ error: "Invalid hint request" }, { status: 400 });
  const item = demoItems.find((candidate) => candidate.id === result.data.itemId);
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404 });

  const hint = await runtimeAiAdapter.tutorHint({
    studentId: result.data.studentId,
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
  });
  return NextResponse.json({ ...hint, itemId: item.id });
}
