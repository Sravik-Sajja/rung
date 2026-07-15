// Uppercase mono kicker used above section and page titles.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("font-mono text-xs font-medium uppercase tracking-wider text-accent", className)}
      {...props}
    />
  );
}
