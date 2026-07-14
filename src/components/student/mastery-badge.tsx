export type MasteryLevel = "not_started" | "needs_support" | "developing" | "mastered";

const copy: Record<MasteryLevel, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-slate-100 text-slate-700" },
  needs_support: { label: "Needs support", className: "bg-amber-100 text-amber-900" },
  developing: { label: "Developing", className: "bg-sky-100 text-sky-900" },
  mastered: { label: "Mastered", className: "bg-emerald-100 text-emerald-900" },
};

export function MasteryBadge({ level }: { level: MasteryLevel }) {
  const status = copy[level];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-medium ${status.className}`}>{status.label}</span>;
}
