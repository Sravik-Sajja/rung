"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AnswerInput } from "@/components/student/answer-input";
import { HintLadder, type HintLevel } from "@/components/student/hint-ladder";
import { PeerGateCard } from "@/components/student/peer-gate-card";
import { ProgressIndicator } from "@/components/student/progress-indicator";
import { Card, Eyebrow, buttonClasses } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";

type PracticeItem = { practiceSessionItemId: string; itemId: string; subskillId: string; prompt: string; position: number; status: "pending" | "missed" | "requeued" | "correct"; isResurfaced: boolean; peerGate: { approachUnlocked: boolean; fullSolutionUnlocked: boolean } };
type Practice = { session: { id: string; studentId: string; status: "active" | "complete"; currentItemId: string | null }; items: PracticeItem[]; progress: { completedItemCount: number; totalItemCount: number } };

const hints: Record<HintLevel, string> = {
  nudge: "Look at what the denominators tell you before you combine fractions.",
  hint: "Choose a denominator both original denominators divide into evenly.",
  guided_step: "Rewrite each fraction over the common denominator, then combine only the numerators. What fraction do you get?",
};

export function PersistedPracticeLoop({ sessionId }: { sessionId: string }) {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [nextPractice, setNextPractice] = useState<Practice | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [activeHint, setActiveHint] = useState<HintLevel | undefined>();
  const [answerRevision, setAnswerRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/practice/${sessionId}?studentId=${canonicalDemoIds.mayaStudentId}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setPractice)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load practice"));
  }, [sessionId]);

  const current = practice?.items.find((item) => item.status !== "correct") ?? null;

  async function submit(answer: string) {
    if (!current || !practice) return;
    setError(null);
    const response = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: canonicalDemoIds.mayaStudentId, context: "practice", practiceSessionId: practice.session.id, practiceSessionItemId: current.practiceSessionItemId, itemId: current.itemId, answer }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "Could not record answer");
      return;
    }
    setLastCorrect(Boolean(body.isCorrect));
    if (body.isCorrect) setNextPractice(body.practice);
    else setPractice(body.practice);
  }

  function tryAgain() {
    setLastCorrect(false);
    setAnswerRevision((currentRevision) => currentRevision + 1);
  }

  function nextQuestion() {
    if (!nextPractice) return;
    setPractice(nextPractice);
    setNextPractice(null);
    setLastCorrect(false);
    setActiveHint(undefined);
    setAnswerRevision((currentRevision) => currentRevision + 1);
  }

  if (!practice || !current) {
    return <AppShell active="student"><section className="max-w-2xl"><p className="text-ink-muted">{error ?? "Loading focused practice…"}</p></section></AppShell>;
  }
  const sessionWillComplete = nextPractice?.session.status === "complete";

  return (
    <AppShell active="student">
      <section className="max-w-2xl space-y-7">
        <div><Eyebrow>Focused practice</Eyebrow><h1 className="mt-2 text-3xl font-bold text-ink">Practice the skill your diagnostic identified</h1><p className="mt-2 text-ink-muted">This sequence was selected from your diagnostic evidence, not from a fixed screen.</p></div>
        <ProgressIndicator completed={practice.progress.completedItemCount} total={practice.progress.totalItemCount} label="Question" />
        <Card className="space-y-5 p-6"><Eyebrow>{current.isResurfaced ? "Quick revisit" : `Question ${current.position}`}</Eyebrow><p className="text-2xl font-semibold text-ink">{current.prompt}</p><AnswerInput key={`${current.practiceSessionItemId}-${answerRevision}`} label={`Your answer to ${current.prompt}`} onSubmit={submit} />
          {error && <p className="text-sm text-red-700">{error}</p>}
          {lastCorrect && <p className="rounded-md border border-spark bg-spark-soft p-3 text-spark">Correct — you can move on when you are ready.</p>}
          {!lastCorrect && current.status === "missed" && <div className="flex gap-3"><button type="button" onClick={tryAgain} className={buttonClasses("secondary", "md")}>Try again</button><button type="button" onClick={() => setActiveHint("nudge")} className={buttonClasses("primary", "md")}>Get a hint</button></div>}
        </Card>
        <HintLadder activeLevel={activeHint} hint={activeHint ? hints[activeHint] : undefined} onRequest={setActiveHint} />
        {!lastCorrect ? (
          <PeerGateCard approachUnlocked={false} fullSolutionUnlocked={false} onSubmitAttempt={() => undefined} />
        ) : (
          <Card className="p-5"><Eyebrow className="mb-2">Worked example</Eyebrow><p className="text-ink">You solved this item correctly. The full worked example is now unlocked for review after you move on.</p></Card>
        )}
        {lastCorrect && <div className="flex justify-end">{sessionWillComplete ? <Link href="/student/mastery" className={buttonClasses("primary", "lg")}>See my progress</Link> : <button type="button" onClick={nextQuestion} className={buttonClasses("primary", "lg")}>Next question</button>}</div>}
      </section>
    </AppShell>
  );
}
