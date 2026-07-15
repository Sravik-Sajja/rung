// Standard page title block: optional eyebrow, balanced title, and a lead description.
import type { ReactNode } from "react";
import { Eyebrow } from "./eyebrow";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <h1 className="text-balance text-3xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-3 text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
