"use client";

// Minimal practice client: loads server-selected items, submits answers, requests hints, and operates the peer gate.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnswerInput } from "@/components/student/answer-input";
import { HintLadder, type HintLevel } from "@/components/student/hint-ladder";
import { PeerGateCard } from "@/components/student/peer-gate-card";

type PracticeItem = { itemId: string; prompt: string; status: string; peerGate: { approachUnlocked: boolean; fullSolutionUnlocked: boolean } };
type PracticeData = { session: { studentId: string; currentItemId: string | null; status: "active" | "complete" }; items: PracticeItem[]; progress: { completedItemCount: number; totalItemCount: number } };
type PeerSolution = { access: "locked" | "approach" | "full_solution"; message?: string; peerSolution?: { authorAlias: string; approachText: string; fullSolution?: string } };

export function PracticeFlow({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<PracticeData>();
  const [hint, setHint] = useState<string>();
  const [hintLevel, setHintLevel] = useState<HintLevel>();
  const [peerSolution, setPeerSolution] = useState<PeerSolution>();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const response = await fetch(`/api/practice/${encodeURIComponent(sessionId)}?studentId=maya-chen`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load practice.");
    setData(result);
    return result as PracticeData;
  }, [sessionId]);

  useEffect(() => { loadSession().catch((error) => setMessage(error.message)).finally(() => setLoading(false)); }, [loadSession]);

  const currentItem = useMemo(() => data?.items.find((item) => item.itemId === data.session.currentItemId), [data]);

  async function submitAnswer(answer: string) {
    if (!currentItem) return;
    setMessage(undefined);
    const response = await fetch("/api/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: "maya-chen", itemId: currentItem.itemId, answer, context: "practice", practiceSessionId: sessionId }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error ?? "Could not submit answer.");
    setMessage(result.isCorrect ? "Correct — moving to the next item." : "Not yet — this item will come back once later in the session.");
    await loadSession();
    await loadPeerSolution(currentItem.itemId);
  }

  async function requestHint(level: HintLevel) {
    if (!currentItem) return;
    const response = await fetch("/api/tutor/hint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: "maya-chen", itemId: currentItem.itemId, attempt: "", level }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error ?? "Could not load a hint.");
    setHint(result.hint);
    setHintLevel(level);
  }

  async function loadPeerSolution(itemId: string) {
    const response = await fetch(`/api/peer-solutions/${encodeURIComponent(itemId)}?studentId=maya-chen`);
    if (response.ok) setPeerSolution(await response.json());
  }

  async function submitPeerAttempt({ attemptText }: { attemptText: string; photo: File | null }) {
    if (!currentItem) return;
    const response = await fetch("/api/peer-attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: "maya-chen", itemId: currentItem.itemId, attemptText, explanation: attemptText }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error ?? "Could not check your attempt.");
    setMessage(result.retryMessage ?? "Peer approach unlocked.");
    await loadSession();
    await loadPeerSolution(currentItem.itemId);
  }

  if (loading) return <p>Loading practice…</p>;
  if (!data || !currentItem) return <><p>{message ?? "Practice is complete."}</p><Link href="/student/mastery" className="mt-5 inline-block text-focus underline">View your skill status</Link></>;

  const currentPeerGate = data.items.find((item) => item.itemId === currentItem.itemId)?.peerGate ?? { approachUnlocked: false, fullSolutionUnlocked: false };
  return <><p className="text-sm text-ink-muted">{data.progress.completedItemCount} of {data.progress.totalItemCount} completed</p><p className="mt-3 rounded bg-surface-2 p-4 text-lg">{currentItem.prompt}</p><div className="mt-4"><AnswerInput onSubmit={submitAnswer} /></div>{message && <p className="mt-3 text-sm text-ink-muted" role="status">{message}</p>}<div className="mt-5"><HintLadder activeLevel={hintLevel} hint={hint} onRequest={requestHint} /></div><div className="mt-5"><PeerGateCard approachUnlocked={currentPeerGate.approachUnlocked} fullSolutionUnlocked={currentPeerGate.fullSolutionUnlocked} onSubmitAttempt={submitPeerAttempt} />{peerSolution?.peerSolution && <div className="mt-3 rounded-lg bg-surface-2 p-4"><p className="font-medium">{peerSolution.peerSolution.authorAlias}’s approach</p><p className="mt-1 text-sm">{peerSolution.peerSolution.approachText}</p>{peerSolution.peerSolution.fullSolution && <p className="mt-2 text-sm"><span className="font-medium">Complete solution:</span> {peerSolution.peerSolution.fullSolution}</p>}</div>}</div></>;
}
