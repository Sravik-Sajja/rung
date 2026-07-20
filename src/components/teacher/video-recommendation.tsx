// One vetted video recommendation. A reviewed video with an embeddable source
// plays inline; a reviewed video that is link-only shows a "Watch on …" link; a
// group without a vetted link yet (url is the "#" sentinel or any non-URL) shows
// an honest "Link pending" badge and no dead anchor. The regex check fails safe:
// anything that is not an http(s) URL renders as pending.
import { Badge, Card, Eyebrow, VideoEmbed } from "@/components/ui";
import type { VettedVideo } from "@/lib/types";

const isReviewedLink = (url: string) => /^https?:\/\//.test(url);

export function VideoRecommendationCard({ video }: { video: VettedVideo }) {
  const watchable = isReviewedLink(video.url);
  const ctaLabel = video.provider === "Rung reviewed resource" ? "Watch the video" : `Watch on ${video.provider}`;

  return (
    <Card className="!bg-elevated flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Vetted video</Eyebrow>
        {watchable ? <Badge tone="accent">Reviewed</Badge> : <Badge tone="neutral">Link pending</Badge>}
      </div>

      {watchable && video.embedUrl ? <VideoEmbed video={video} className="mt-3" /> : null}

      <h2 className="mt-3 text-lg font-semibold text-ink">{video.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{video.provider}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">{video.verificationNote}</p>

      <div className="mt-auto border-t border-border pt-3">
        {watchable ? (
          <a
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline"
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {video.embedUrl ? `Open on ${video.provider}` : ctaLabel}
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
              <path d="M14 4h6v6" />
              <path d="m20 4-9 9" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <p className="text-xs text-ink-faint">Suggested resource — reviewed link coming soon.</p>
        )}
      </div>
    </Card>
  );
}
