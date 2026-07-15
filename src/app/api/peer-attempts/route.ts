// Validates a meaningful local attempt before unlocking only a peer approach.
import { NextResponse } from "next/server";
import { submitLocalPeerAttempt } from "@/lib/student/demo-flow";
import { peerAttemptSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const body = peerAttemptSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid peer-attempt request" }, { status: 400 });
  const result = await submitLocalPeerAttempt(body.data);
  if (!result) return NextResponse.json({ error: "Unknown demo student or item" }, { status: 404 });
  return NextResponse.json(result);
}
