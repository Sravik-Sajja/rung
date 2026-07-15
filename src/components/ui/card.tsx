// Card surface primitive. `interactive` adds hover affordance for clickable cards.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({
  interactive = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-md",
        interactive && "transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg",
        className
      )}
      {...props}
    />
  );
}
