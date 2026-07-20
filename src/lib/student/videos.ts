// Student-facing vetted-video lookup, keyed by subskill (WS1b).
//
// Demo mode derives the video from the same reviewed records the teacher group page already
// renders (`demoGroupPlans` in `src/lib/demo-data.ts`) — group ids align with subskill ids, so no
// new demo fixture is needed. Persisted mode reads the durable `video_recommendations` table.
import { createClient } from "@supabase/supabase-js";
import { demoGroupPlans } from "@/lib/demo-data";
import type { ActorStore } from "@/lib/auth/actor";
import type { VettedVideo } from "@/lib/types";

function configuredClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/** Demo mode: the group plan keyed by this subskill already carries its one reviewed video. */
export function getDemoVideoForSubskill(subskillId: string): VettedVideo | null {
  return demoGroupPlans[subskillId]?.video ?? null;
}

/**
 * Persisted mode: the first active reviewed video for this subskill. Returns `null` when Supabase
 * is not configured, when no active row exists, AND when the query itself fails — deliberately
 * swallowed rather than thrown. `video_recommendations` has no student consumer anywhere else in
 * this codebase yet, so this is the first live read against it from student-facing code; a
 * refresher video is optional polish, and a schema surprise or transient Supabase error here must
 * never fail the whole practice-session load that embeds it (see the `[sessionId]` practice route).
 */
export async function getPersistedVideoForSubskill(subskillId: string): Promise<VettedVideo | null> {
  const client = configuredClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("video_recommendations")
      .select("title, provider, url, verification_note, embed_url")
      .eq("subskill_id", subskillId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { title: string; provider: string; url: string; verification_note: string | null; embed_url: string | null };
    return { title: row.title, provider: row.provider, url: row.url, verificationNote: row.verification_note ?? "", embedUrl: row.embed_url ?? undefined };
  } catch {
    return null;
  }
}

export async function getVideoForSubskill(input: { subskillId: string; store: ActorStore }): Promise<VettedVideo | null> {
  return input.store === "local_demo" ? getDemoVideoForSubskill(input.subskillId) : getPersistedVideoForSubskill(input.subskillId);
}
