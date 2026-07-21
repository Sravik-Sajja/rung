// Thin wrapper around the shared Badge primitive so every mastery level renders a semantic
// tone plus its own text label — color is never the only signal.
import { Badge } from "@/components/ui";
import type { MasteryLevel } from "@/lib/types";

export type { MasteryLevel };

const copy: Record<MasteryLevel, { label: string; tone: "none" | "support" | "developing" | "mastered" }> = {
  not_started: { label: "Not started", tone: "none" },
  needs_support: { label: "Needs support", tone: "support" },
  developing: { label: "Developing", tone: "developing" },
  mastered: { label: "Mastered", tone: "mastered" },
};

export function MasteryBadge({ level }: { level: MasteryLevel }) {
  const status = copy[level];
  return <Badge tone={status.tone} className="whitespace-nowrap">{status.label}</Badge>;
}
