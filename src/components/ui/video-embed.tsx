// Shared vetted-video iframe embed (youtube-nocookie source, fixed aspect-video frame).
// Presentational only: it renders nothing about eligibility/embeddability — callers (teacher
// video card, student practice recap) decide whether and when to show it. Extracted from
// `teacher/video-recommendation.tsx` so the student-surface video gate (WS3) can reuse the exact
// same embed instead of forking the iframe markup.
import { cn } from "./cn";
import type { VettedVideo } from "@/lib/types";

export function VideoEmbed({ video, className }: { video: VettedVideo; className?: string }) {
  if (!video.embedUrl) return null;

  return (
    <div className={cn("aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2", className)}>
      <iframe
        className="h-full w-full"
        src={video.embedUrl}
        title={video.title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
