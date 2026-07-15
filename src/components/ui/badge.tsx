// Badge / pill primitive. Neutral by default; mastery tones carry semantic color plus their own label text.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "none" | "support" | "developing" | "mastered";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-muted border border-border",
  accent: "bg-accent-soft text-accent",
  none: "bg-mastery-none text-mastery-none-fg",
  support: "bg-mastery-support text-mastery-support-fg",
  developing: "bg-mastery-developing text-mastery-developing-fg",
  mastered: "bg-mastery-mastered text-mastery-mastered-fg"
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
