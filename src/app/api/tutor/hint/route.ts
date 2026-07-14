// Server-only tutor endpoint: validates hint requests and uses the safe AI adapter boundary.
import { NextResponse } from "next/server";
import { getTutorHint } from "@/lib/ai/adapter";
import { hintSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const result = hintSchema.safeParse(await request.json());
  if (!result.success) return NextResponse.json({ error: "Invalid hint request" }, { status: 400 });
  return NextResponse.json(await getTutorHint(result.data.itemId, result.data.level));
}
