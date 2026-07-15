// One vetted video recommendation: provider, title, and a verification note (never auto-fetched).
import { Badge, Card, Eyebrow } from "@/components/ui";
import type { VettedVideo } from "@/lib/types";

export function VideoRecommendationCard({ video }: { video: VettedVideo }) {
  return (
    <Card className="!bg-elevated flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Vetted video</Eyebrow>
        <Badge tone="neutral">Reviewed</Badge>
      </div>
      <h2 className="mt-1 text-lg font-semibold text-ink">{video.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{video.provider}</p>
      <p className="mt-auto border-t border-border pt-3 text-xs text-ink-faint">{video.verificationNote}</p>
    </Card>
  );
}
