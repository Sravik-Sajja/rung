// The Rung lockup: a climb mark plus the wordmark, shared by both shells so the brand reads the
// same on every surface. Deliberately carries no subject descriptor — the product is not limited to
// math; math is only what the current demo happens to teach.
import { cn } from "@/components/ui";

/**
 * Three rungs ascending left-to-right, with the top one in spark gold — the same "next rung you're
 * climbing to" signal RungProgress already uses. Offset into a staircase rather than stacked flush,
 * because three equal bars at this size would read as a hamburger menu button.
 */
export function RungMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("h-[18px] w-[18px] shrink-0", className)}>
      <rect x="0.5" y="10.5" width="6" height="3" rx="1.5" className="fill-accent" />
      <rect x="5" y="6" width="6" height="3" rx="1.5" className="fill-accent" />
      <rect x="9.5" y="1.5" width="6" height="3" rx="1.5" className="fill-spark" />
    </svg>
  );
}

export function RungWordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <RungMark className={size === "sm" ? "h-4 w-4" : undefined} />
      <span className={cn("font-extrabold tracking-tight text-ink", size === "sm" ? "text-base" : "text-lg")}>
        Rung
      </span>
    </span>
  );
}
