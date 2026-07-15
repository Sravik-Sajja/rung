// Server-only answer submission endpoint: validates, scores, then will persist responses.
import { NextResponse } from "next/server";
import { recordStudentResponse } from "@/lib/student/response-service";
import { recordLocalResponse } from "@/lib/student/demo-flow";
import { responseSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const result = responseSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  const local = recordLocalResponse(result.data);
  if ("error" in local) return NextResponse.json({ error: local.error }, { status: 404 });
  const persisted = await recordStudentResponse(result.data);
  if (persisted?.error) return NextResponse.json({ error: persisted.error }, { status: 404 });
  if (persisted) return NextResponse.json({ isCorrect: persisted.isCorrect, normalizedAnswer: result.data.answer.trim(), responseId: persisted.responseId, masteryLevel: persisted.level });
  return NextResponse.json({ isCorrect: local.response.isCorrect, normalizedAnswer: result.data.answer.trim(), responseId: local.response.id });
}
