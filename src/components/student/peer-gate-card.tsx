"use client";

import { useState } from "react";

export function PeerGateCard({
  approachUnlocked,
  fullSolutionUnlocked,
  onSubmitAttempt,
}: {
  approachUnlocked: boolean;
  fullSolutionUnlocked: boolean;
  onSubmitAttempt: (attemptText: string, explanation: string) => void;
}) {
  const [attemptText, setAttemptText] = useState("");
  const [explanation, setExplanation] = useState("");
  const canSubmit = Boolean(attemptText.trim() && explanation.trim());

  return <section className="rounded-lg border border-slate-200 p-4" aria-labelledby="peer-gate-title">
    <h2 id="peer-gate-title" className="font-semibold">See a peer&apos;s approach</h2>
    <p className="mt-1 text-sm text-slate-600">Show what you tried first. A peer&apos;s first step unlocks after a meaningful attempt.</p>
    {!approachUnlocked && <div className="mt-3 space-y-3">
      <textarea value={attemptText} onChange={(event) => setAttemptText(event.target.value)} className="min-h-20 w-full rounded-md border border-slate-300 p-2" placeholder="Write your math attempt" aria-label="Your math attempt" />
      <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} className="min-h-16 w-full rounded-md border border-slate-300 p-2" placeholder="What did you try?" aria-label="What you tried" />
      <button type="button" disabled={!canSubmit} onClick={() => onSubmitAttempt(attemptText.trim(), explanation.trim())} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white disabled:bg-slate-400">Check my attempt</button>
    </div>}
    {approachUnlocked && <p className="mt-3 rounded-md bg-emerald-50 p-3 text-emerald-900">Peer approach unlocked. The full worked solution {fullSolutionUnlocked ? "is available." : "unlocks after you solve the problem correctly."}</p>}
  </section>;
}
