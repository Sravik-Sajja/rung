// Server-only answer submission endpoint: validates, scores, then will persist responses.
import { NextResponse } from "next/server";
import { demoItems } from "@/lib/demo-data";
import { scoreAnswer } from "@/lib/math/scoring";
import { recordStudentResponse } from "@/lib/student/response-service";
import { responseSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const result = responseSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  const item = demoItems.find(({ id }) => id === result.data.itemId);
  const persisted = await recordStudentResponse(result.data);
  if (persisted?.error) return NextResponse.json({ error: persisted.error }, { status: 404 });
  if (persisted) return NextResponse.json({ isCorrect: persisted.isCorrect, normalizedAnswer: result.data.answer.trim(), responseId: persisted.responseId, masteryLevel: persisted.level });
  if (!item) return NextResponse.json({ error: "Unknown demo item" }, { status: 404 });
  const isCorrect = scoreAnswer(item, result.data.answer);
  return NextResponse.json({ isCorrect, normalizedAnswer: result.data.answer.trim(), responseId: "pending-persistence" });
}
