"use client";

export type HintLevel = "nudge" | "hint" | "guided_step";

const labels: Record<HintLevel, string> = {
  nudge: "Nudge",
  hint: "Hint",
  guided_step: "Guided step",
};

export function HintLadder({
  activeLevel,
  hint,
  onRequest,
  loading = false,
}: {
  activeLevel?: HintLevel;
  hint?: string;
  onRequest: (level: HintLevel) => void;
  loading?: boolean;
}) {
  return <section aria-label="Tutor hints" className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
    <h2 className="font-semibold text-slate-900">Need a hand?</h2>
    <p className="mt-1 text-sm text-slate-600">Try the smallest helpful rung first.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {(Object.keys(labels) as HintLevel[]).map((level) => <button key={level} type="button" disabled={loading} onClick={() => onRequest(level)} className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-800 disabled:opacity-50">
        {labels[level]}
      </button>)}
    </div>
    {hint && <p className="mt-4 rounded-md bg-white p-3 text-slate-800" role="status"><span className="font-medium">{activeLevel ? labels[activeLevel] : "Tutor"}:</span> {hint}</p>}
  </section>;
}
