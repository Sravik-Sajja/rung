"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StudentShell } from "@/components/student/surface/student-shell";
import { RungProgress } from "@/components/student/surface/rung-progress";
import { FractionExpression } from "@/components/student/fraction";
import { NumberLineQuestion } from "@/components/student/number-line-question";
import { FractionInput, answerModeForSubskill, type FractionInputHandle } from "@/components/student/fraction-input";
import { ItemModel } from "@/components/student/models/item-model";
import { HintLadder, type HintLevel } from "@/components/student/hint-ladder";
import { WorkHelpCard } from "@/components/student/work-help-card";
import { StreakChip } from "@/components/student/surface/streak-chip";
import { WinFeedback } from "@/components/student/surface/win-feedback";
import { MasteryBadge } from "@/components/student/mastery-badge";
import { buttonClasses, Eyebrow, VideoEmbed } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import type { ItemVisualSpec, MasteryLevel, VettedVideo } from "@/lib/types";

type PracticeItem = { practiceSessionItemId: string; itemId: string; subskillId: string; prompt: string; visualSpec?: ItemVisualSpec; position: number; status: "pending" | "missed" | "requeued" | "correct"; isResurfaced: boolean; peerGate: { approachUnlocked: boolean; fullSolutionUnlocked: boolean }; plan?: { subskillId: string; title: string; reason: string } };
// `progress` only exists on the GET /api/practice payload — the POST /api/responses `practice`
// object omits it — so the UI derives counts from `items` instead of reading it. `video` (WS1b) is
// also GET-only (the plan's subskill vetted video, or null); the POST `practice` payload omits it
// too, so the client captures it once from the initial load (see the `video` state below) rather
// than re-reading it off every `practice`/`nextPractice` object.
type Practice = { session: { id: string; studentId: string; status: "active" | "complete"; currentItemId: string | null }; items: PracticeItem[]; progress?: { completedItemCount: number; totalItemCount: number }; video?: VettedVideo | null };

/** The plan's target subskill, read from the first item — stable for the whole session even once
 * later items resolve to "correct" (see demo-learning-store's dedup-on-solve, which only ever
 * drops the *duplicate* requeued occurrence, never the original first item). */
function planSubskillId(data: Practice | null): string | null {
  const firstItem = data?.items[0];
  return firstItem?.plan?.subskillId ?? firstItem?.subskillId ?? null;
}

/** Answer-safe: reads only the mastery *level* for one subskill, never scoring/answer data. */
async function fetchMasteryLevel(studentId: string, subskillId: string): Promise<MasteryLevel | null> {
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(studentId)}/mastery?topicId=${encodeURIComponent(canonicalDemoIds.fractionsTopicId)}`);
    if (!response.ok) return null;
    const body: { skills?: Array<{ subskillId: string; level: MasteryLevel }> } = await response.json();
    return body.skills?.find((skill) => skill.subskillId === subskillId)?.level ?? null;
  } catch {
    return null;
  }
}

const VIDEO_GATE_SECONDS = 45;

function formatGateCountdown(remainingSeconds: number) {
  const clamped = Math.max(remainingSeconds, 0);
  return `0:${String(clamped).padStart(2, "0")}`;
}

// The external action button submits the FractionInput's form via the `form` attribute, so
// Check and Next can morph in one fixed position at the bottom of the card (mirrors the
// diagnostic page's ANSWER_FORM_ID pattern).
const ANSWER_FORM_ID = "practice-answer-form";

// Decorative ladder rungs for the side margins on very wide screens — copied locally (not
// imported) to match the diagnostic page's ambient frame without creating a cross-file dependency.
const RUNG_MOTIF_OPACITIES = [0.16, 0.3, 0.45, 0.62, 0.8];

function RungMotif({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 hidden flex-col justify-center gap-10 xl:flex 2xl:gap-12 ${
        side === "left" ? "left-2 2xl:left-10" : "right-2 2xl:right-10"
      }`}
    >
      {RUNG_MOTIF_OPACITIES.map((opacity, index) => (
        <span key={index} className="h-1 w-12 rounded-full bg-border-strong 2xl:w-16" style={{ opacity }} />
      ))}
    </div>
  );
}

// Small, deterministic encouragement pools — never Math.random in render. Each pool is indexed
// by a stable value already in state/props (streak count, question number, session id) so the
// same situation always renders the same copy within a render, but the line still varies across
// items instead of repeating the same sentence every time.
// WinFeedback already renders its own "Boom, you leveled up this skill." headline for a correct
// answer, so this pool supplies the secondary line underneath it and deliberately avoids
// repeating that headline verbatim.
const CORRECT_LINES = [
  "Clean and correct — keep that pace.",
  "That's the move. On to the next one.",
  "Locked in. Nice work.",
  "Nailed it. Keep the streak going.",
];
const RECOVERY_LINES = [
  "You fixed it — that's the skill.",
  "Stuck, then solved. That's real progress.",
  "That's exactly how you close the gap.",
];
const SESSION_START_LINES = [
  "Let's warm up with the first one.",
  "Fresh set — take your time on this one.",
  "Here we go. First rung of the climb.",
];

/** Deterministic (non-random) index into a copy pool, derived from a stable string key. */
function stableIndex(key: string, length: number) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return hash % length;
}

export function PersistedPracticeLoop({ sessionId, returnTo, studentId }: { sessionId: string; returnTo?: string; studentId: string }) {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [nextPractice, setNextPractice] = useState<Practice | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [activeHint, setActiveHint] = useState<HintLevel | undefined>();
  const [hintText, setHintText] = useState<string>();
  const [hintLoading, setHintLoading] = useState(false);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [lastAttempt, setLastAttempt] = useState("");
  // This is an escalation, not another first-attempt aid: the learner must
  // use a substantive hint and then miss the same item again.
  const [workHelpEligible, setWorkHelpEligible] = useState(false);
  const [answerRevision, setAnswerRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Progressive disclosure: the hint ladder starts behind a quiet affordance;
  // work help appears only after another missed response following a real hint.
  const [hintOpen, setHintOpen] = useState(false);
  // Motivation state: real session counters, not fabricated numbers. Streak counts consecutive
  // correct submissions this session and resets to 0 on any miss; recoveredFromMiss marks the
  // specific correct answer that followed a miss on this same item, so the feedback copy can
  // call out the comeback instead of reusing the generic "correct" line.
  const [streak, setStreak] = useState(0);
  const [recoveredFromMiss, setRecoveredFromMiss] = useState(false);
  const answerRef = useRef<FractionInputHandle>(null);

  // WS3 recap accumulator: the server marks a resolved item "correct" and quietly drops its
  // requeue duplicate (see demo-learning-store's recordDemoPracticeResponse), so by the time the
  // session completes every item reads "correct" — there is no server-side trace of which ones
  // were ever missed. This map is the only record of that, built live as misses happen, keyed by
  // the stable itemId (not the per-occurrence practiceSessionItemId, which changes on a requeue).
  const [missedItems, setMissedItems] = useState<Map<string, string>>(new Map());
  // The plan's subskill video (WS1b), captured once from the initial GET payload — the POST
  // /api/responses `practice` object never carries it, and it does not change during a session.
  const [video, setVideo] = useState<VettedVideo | null>(null);
  // Mastery movement for the recap: captured once at mount and again once the session completes.
  // A failed fetch leaves the value `null`, and the recap simply omits that row rather than crash.
  const [initialMastery, setInitialMastery] = useState<MasteryLevel | null>(null);
  const [finalMastery, setFinalMastery] = useState<MasteryLevel | null>(null);
  const initialMasteryFetchStarted = useRef(false);
  const finalMasteryFetchStarted = useRef(false);
  // Video-gate state (WS3b). Deliberately plain client state, not persisted anywhere: refreshing
  // the practice page re-arms the gate from scratch. `hasOpenedVideo` stays true once the panel has
  // ever been opened even if the student collapses it again; `watchSeconds` only counts up while
  // the panel is open (paused, not reset, while closed) and caps at VIDEO_GATE_SECONDS.
  const [videoOpened, setVideoOpened] = useState(false);
  const [hasOpenedVideo, setHasOpenedVideo] = useState(false);
  const [watchSeconds, setWatchSeconds] = useState(0);

  useEffect(() => {
    fetch(`/api/practice/${sessionId}?studentId=${encodeURIComponent(studentId)}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then((data: Practice) => {
        setPractice(data);
        setVideo(data.video ?? null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load practice"));
  }, [sessionId, studentId]);

  // Mastery *before* this session's practice can move it — fetched once, the first time the
  // session's subskill is known.
  useEffect(() => {
    if (!practice || initialMasteryFetchStarted.current) return;
    const subskillId = planSubskillId(practice);
    if (!subskillId) return;
    initialMasteryFetchStarted.current = true;
    fetchMasteryLevel(studentId, subskillId).then(setInitialMastery);
  }, [practice, studentId]);

  // Mastery *after* the session resolves — refetched once completion is reached, so the recap can
  // render the old -> new movement.
  useEffect(() => {
    if (finalMasteryFetchStarted.current || nextPractice?.session.status !== "complete") return;
    const subskillId = planSubskillId(practice) ?? planSubskillId(nextPractice);
    if (!subskillId) return;
    finalMasteryFetchStarted.current = true;
    fetchMasteryLevel(studentId, subskillId).then(setFinalMastery);
  }, [nextPractice, practice, studentId]);

  // The countdown only ticks while the refresher panel is open, and stops (cleanup) the moment it
  // closes or the component unmounts — no timer runs in the background.
  useEffect(() => {
    if (!videoOpened) return;
    const interval = setInterval(() => {
      setWatchSeconds((seconds) => (seconds >= VIDEO_GATE_SECONDS ? seconds : seconds + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [videoOpened]);

  function openVideoPanel() {
    setVideoOpened(true);
    setHasOpenedVideo(true);
  }

  function closeVideoPanel() {
    setVideoOpened(false);
  }

  const current = practice?.items.find((item) => item.status !== "correct") ?? null;

  async function submit(answer: string) {
    if (!current || !practice) return;
    const hadSubstantiveHint = activeHint === "hint" || activeHint === "guided_step";
    // Captured before the response resolves: current.status already reflects any prior miss on
    // this occurrence ("missed"/"requeued" vs a first-attempt "pending"), so a correct result on
    // this submission is a genuine recovery, not just a first-try success.
    const itemHadPriorMiss = current.status !== "pending";
    setError(null);
    setLastAttempt(answer);
    setAnswerLoading(true);
    try {
      const response = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, context: "practice", practiceSessionId: practice.session.id, practiceSessionItemId: current.practiceSessionItemId, itemId: current.itemId, answer }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Could not record answer");
        return;
      }
      const isCorrect = Boolean(body.isCorrect);
      setLastCorrect(isCorrect);
      if (isCorrect) {
        setNextPractice(body.practice);
        setStreak((count) => count + 1);
        setRecoveredFromMiss(itemHadPriorMiss);
      } else {
        setPractice(body.practice);
        setStreak(0);
        setRecoveredFromMiss(false);
        if (hadSubstantiveHint) setWorkHelpEligible(true);
        // Record the miss before the requeue/dedup machinery erases the trace of it: this is the
        // only place a miss is ever observable, since a later correct answer on the same item both
        // flips its status to "correct" and drops the duplicate requeued occurrence.
        const missedItemId = current.itemId;
        const missedPrompt = current.prompt;
        setMissedItems((previous) => {
          if (previous.has(missedItemId)) return previous;
          const next = new Map(previous);
          next.set(missedItemId, missedPrompt);
          return next;
        });
      }
    } finally {
      setAnswerLoading(false);
    }
  }

  function nextQuestion() {
    if (!nextPractice) return;
    setPractice(nextPractice);
    setNextPractice(null);
    setLastCorrect(false);
    setActiveHint(undefined);
    setHintText(undefined);
    setLastAttempt("");
    setWorkHelpEligible(false);
    setAnswerRevision((currentRevision) => currentRevision + 1);
    setHintOpen(false);
    setRecoveredFromMiss(false);
  }

  async function requestHint(level: HintLevel) {
    if (!current) return;
    setError(null);
    setHintLoading(true);
    try {
      const response = await fetch("/api/tutor/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          itemId: current.itemId,
          practiceSessionId: practice?.session.id,
          practiceSessionItemId: current.practiceSessionItemId,
          attempt: lastAttempt,
          level,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not load a hint right now.");
      setActiveHint(level);
      setHintText(body.hint);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load a hint right now.");
    } finally {
      setHintLoading(false);
    }
  }

  if (!practice || !current) {
    return (
      <StudentShell size="wide">
        <section className="relative flex flex-1 items-center justify-center">
          <p className="text-ink-muted">{error ?? "Loading focused practice…"}</p>
        </section>
      </StudentShell>
    );
  }

  const sessionWillComplete = nextPractice?.session.status === "complete";
  const summaryHref = `/student/practice/${sessionId}/summary?studentId=${encodeURIComponent(studentId)}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const masteryHref = `/student/mastery?studentId=${encodeURIComponent(studentId)}`;
  // Rung count is derived from the items themselves (the same formula the GET route uses for its
  // `progress` field, which POST responses omit), not the item's own position, since resurfaced
  // items can revisit an earlier rung without moving the count backwards.
  const completedItemCount = practice.items.filter((item) => item.status === "correct").length;
  const totalItemCount = practice.items.length;
  const questionNumber = Math.min(completedItemCount + 1, totalItemCount);
  // The miss panel and the work-help escalation still require a server-recorded miss on this
  // item — unchanged. The Ask-AI trigger below no longer depends on this: it is reachable from
  // the first attempt (see the help row further down).
  const showMissed = !lastCorrect && current.status === "missed";
  const workHelpSupportLevel = activeHint === "hint" || activeHint === "guided_step" ? activeHint : null;
  const showWorkHelp = showMissed && workHelpEligible && workHelpSupportLevel !== null;
  // Session-start encouragement only applies before the very first attempt of the session: first
  // question, still pending, nothing submitted yet.
  const showSessionStart = questionNumber === 1 && current.status === "pending" && !lastCorrect && lastAttempt === "" && !hintOpen;
  const sessionStartMessage = SESSION_START_LINES[stableIndex(sessionId, SESSION_START_LINES.length)];
  // Streak already reflects this correct answer by the time lastCorrect renders true (both are
  // set from the same submit() call), so streak - 1 is a safe, always-valid pool index.
  const correctMessage = recoveredFromMiss
    ? RECOVERY_LINES[stableIndex(current.practiceSessionItemId, RECOVERY_LINES.length)]
    : CORRECT_LINES[Math.max(streak - 1, 0) % CORRECT_LINES.length];

  // WS3 recap numbers. Y is read from the completed `nextPractice` snapshot (guaranteed non-null
  // once sessionWillComplete is true) since by then every duplicate requeue occurrence has already
  // been dropped server-side — see the `missedItems` comment above for why that snapshot alone
  // can't tell us *which* items were missed.
  const completionItemCount = nextPractice?.items.length ?? totalItemCount;
  const firstTryCount = Math.max(completionItemCount - missedItems.size, 0);
  const missedPrompts = Array.from(missedItems.entries()).map(([itemId, prompt]) => ({ itemId, prompt }));
  // "Stuck" is deterministic and derived from real session/mastery state only — never an AI
  // judgment call: at least one miss this session, or the post-session mastery reads needs_support.
  const stuck = missedItems.size > 0 || finalMastery === "needs_support";
  // A stuck session is only ever gated behind a video that can actually be played inline. If this
  // subskill has no vetted video, or only a link-only record with no embeddable source (e.g. a
  // persisted `video_recommendations` row, which carries no embed URL), the student is never
  // trapped waiting on a refresher panel that would render empty. Demo videos always embed.
  const hasPlayableVideo = Boolean(video?.embedUrl);
  const gateActive = stuck && hasPlayableVideo;
  const gateSatisfied = hasOpenedVideo && watchSeconds >= VIDEO_GATE_SECONDS;
  const continueLocked = gateActive && !gateSatisfied;

  return (
    <StudentShell size="wide" aside={<StreakChip count={streak} />}>
      {/* One centered reading column, mirroring the diagnostic's ambient frame: a soft glow and
          ladder motif treat the space beside the focal card as designed quiet, not empty. */}
      <section className="relative flex flex-1 items-center justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-full max-w-[52rem] -translate-x-1/2 -translate-y-1/2 opacity-70 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--spark-soft), transparent)" }}
        />
        <RungMotif side="left" />
        <RungMotif side="right" />

        <div className="relative mx-auto w-full max-w-3xl py-8">
          <div className="space-y-6">
            <h1 className="sr-only">Focused practice</h1>
            <div key={`${current.practiceSessionItemId}-progress`} className="animate-rise space-y-2">
              <RungProgress current={questionNumber} total={totalItemCount} label="Question" />
              {showSessionStart && <p className="text-sm text-ink-muted">{sessionStartMessage}</p>}
            </div>

            {/* One elevated card is the single focal point, keyed on the item so it rises in fresh
                each question. Two zones: question, then answer + help + one morphing action button. */}
            <div key={current.practiceSessionItemId} className="animate-rise rounded-2xl border border-border bg-elevated shadow-lg">
              <div className="flex flex-col items-center gap-3 p-8 text-center sm:p-10 2xl:p-14">
                {current.plan && <div className="w-full border-l-2 border-focus pl-4 text-left"><p className="text-sm font-semibold text-focus">Practice plan &middot; {current.plan.title}</p><p className="mt-1 text-sm text-ink-muted">{current.plan.reason}</p></div>}
                {current.isResurfaced && (
                  <span className="inline-flex items-center rounded-full border border-spark bg-spark-soft px-3 py-1 text-xs font-semibold text-spark-ink">
                    Quick revisit
                  </span>
                )}
                <FractionExpression text={current.prompt} size="lg" className="justify-center 2xl:text-4xl" />
                {current.visualSpec?.kind === "number_line" && <NumberLineQuestion visualSpec={current.visualSpec} />}
              </div>

                <ItemModel
                  subskillId={current.subskillId}
                  prompt={current.prompt}
                  disabled={lastCorrect}
                onUseAnswer={(answer) => answerRef.current?.setAnswer(answer)}
                visualSpec={current.visualSpec}
              />

              <div className="flex flex-col items-center gap-6 border-t border-border p-8 sm:p-10 2xl:p-12">
                <FractionInput
                  key={`${current.practiceSessionItemId}-${answerRevision}`}
                  ref={answerRef}
                  formId={ANSWER_FORM_ID}
                  showSubmit={false}
                  label={`Your answer to ${current.prompt}`}
                  disabled={lastCorrect}
                  onSubmit={submit}
                  className="items-center text-center"
                  defaultMode={answerModeForSubskill(current.subskillId)}
                />

                <div aria-live="polite" className="flex w-full flex-col items-center gap-3 empty:hidden">
                  {lastCorrect && (
                    // Green is reserved for correct/mastery — the one moment this surface uses it.
                    // Keyed on the item so a second correct answer in a row rises in fresh instead
                    // of silently relabeling the same node.
                    <div key={current.practiceSessionItemId} className="w-full">
                      <WinFeedback correct message={correctMessage} />
                    </div>
                  )}
                  {showMissed && (
                    // No "Try again" button: the input is never disabled after a miss and Check
                    // still submits, so the answer stays live and editable. A button here only
                    // wiped the fields while implying it was a required step before retrying.
                    <div className="w-full rounded-lg border border-border bg-surface-2 p-4 text-left" role="status">
                      <p className="text-sm font-semibold text-ink">Not yet, you&rsquo;ve got this.</p>
                      <p className="mt-1 text-sm text-ink-muted">Adjust your answer and press Check again.</p>
                    </div>
                  )}
                  {error && <p className="text-sm text-danger">{error}</p>}
                </div>

                {!lastCorrect ? (
                  <button type="submit" form={ANSWER_FORM_ID} disabled={answerLoading} className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
                    {answerLoading ? "Checking…" : "Check"}
                  </button>
                ) : sessionWillComplete ? (
                  // The inline recap stays the completion surface (it owns the mandatory video
                  // gate — a separate summary route could be navigated to before the refresher is
                  // watched); the fuller attempt-by-attempt summary page is offered from inside
                  // it once the gate clears.
                  <RecapPanel
                    firstTryCount={firstTryCount}
                    totalCount={completionItemCount}
                    missedPrompts={missedPrompts}
                    initialMastery={initialMastery}
                    finalMastery={finalMastery}
                    video={video}
                    gateActive={gateActive}
                    videoOpened={videoOpened}
                    onOpenVideo={openVideoPanel}
                    onCloseVideo={closeVideoPanel}
                    continueLocked={continueLocked}
                    remainingSeconds={VIDEO_GATE_SECONDS - watchSeconds}
                    primaryHref={returnTo ?? masteryHref}
                    primaryLabel={returnTo ? "Back to practice plans" : "See my progress"}
                    summaryHref={summaryHref}
                  />
                ) : (
                  <button type="button" onClick={nextQuestion} className={buttonClasses("focus", "lg", "animate-pop w-full sm:w-72")}>
                    Next question
                  </button>
                )}
              </div>
            </div>

            {/* Quiet help row: the hint ladder stays collapsed until the student explicitly asks,
                and is reachable from the very first attempt — not gated on a miss. It is a plain
                secondary text link (not the focus-filled Check/Next button) placed below the
                answer card, so it never competes with the primary action. Server-side, both the
                demo store (recordDemoPracticeSupportHint) and the persisted RPC
                (record_practice_support_hint, supabase/migrations/007_practice_support_boundary.sql)
                already only require the occurrence to be non-"correct" — neither ever required a
                "missed" status — so nudge/hint/guided_step were already reachable pre-miss at the
                server; this was a client-only gate. Work-help stays untouched: still requires
                showMissed && workHelpEligible (miss -> substantive hint -> a later miss).
                -mt-3 trims the space-y-6 gap above (card -> help row) so this reads closer to the
                answer-mode toggle's quiet-link family, without touching the gap-6 the card itself
                keeps around the feedback region and the Check/Next button. */}
            <div className="-mt-3 flex flex-wrap items-center gap-5 empty:hidden">
              {!sessionWillComplete && !lastCorrect && !hintOpen && (
                <button
                  type="button"
                  onClick={() => setHintOpen(true)}
                  className="text-sm font-medium text-focus underline-offset-4 hover:underline"
                >
                  Stuck? Ask AI for help
                </button>
              )}
            </div>

            {!sessionWillComplete && hintOpen && (
              <div className="animate-rise">
                <HintLadder activeLevel={activeHint} hint={hintText} loading={hintLoading} onRequest={requestHint} embedded />
              </div>
            )}

            {!sessionWillComplete && showWorkHelp && workHelpSupportLevel && (
              <div className="animate-rise">
                <WorkHelpCard
                  studentId={studentId}
                  itemId={current.itemId}
                  practiceSessionId={practice.session.id}
                  practiceSessionItemId={current.practiceSessionItemId}
                  supportLevel={workHelpSupportLevel}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </StudentShell>
  );
}

/**
 * WS3 recap step, rendered in place of the return button once the session completes. Answer-safe
 * by construction: it only ever sees prompts (from the missed-items accumulator) and mastery
 * *levels* — never a correct answer or answerSpec.
 */
function RecapPanel({
  firstTryCount,
  totalCount,
  missedPrompts,
  initialMastery,
  finalMastery,
  video,
  gateActive,
  videoOpened,
  onOpenVideo,
  onCloseVideo,
  continueLocked,
  remainingSeconds,
  primaryHref,
  primaryLabel,
  summaryHref,
}: {
  firstTryCount: number;
  totalCount: number;
  missedPrompts: Array<{ itemId: string; prompt: string }>;
  initialMastery: MasteryLevel | null;
  finalMastery: MasteryLevel | null;
  video: VettedVideo | null;
  gateActive: boolean;
  videoOpened: boolean;
  onOpenVideo: () => void;
  onCloseVideo: () => void;
  continueLocked: boolean;
  remainingSeconds: number;
  primaryHref: string;
  primaryLabel: string;
  summaryHref: string;
}) {
  const cleanRun = missedPrompts.length === 0;
  const headline = cleanRun
    ? "Clean run — every question first try."
    : "You fought through this one. That's the skill that sticks.";

  return (
    <div className="w-full space-y-6 text-center">
      <div className="space-y-1">
        <Eyebrow>Practice complete</Eyebrow>
        <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{headline}</h2>
      </div>

      <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface-2 p-6">
        <p className="font-mono text-4xl font-bold tabular-nums text-ink">
          {firstTryCount} / {totalCount}
        </p>
        <p className="text-sm text-ink-muted">first try</p>
      </div>

      {cleanRun ? (
        <p className="text-sm text-ink-muted">No revisits needed this time — nice work.</p>
      ) : (
        <div className="space-y-3 text-left">
          <p className="text-sm font-semibold text-ink">Came back for a revisit</p>
          <ul className="space-y-2">
            {missedPrompts.map((item) => (
              <li key={item.itemId} className="rounded-lg border border-border bg-surface-2 p-3">
                <FractionExpression text={item.prompt} size="md" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {finalMastery && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-border p-4">
          <span className="text-sm text-ink-muted">Skill mastery</span>
          {initialMastery && <MasteryBadge level={initialMastery} />}
          {initialMastery && (
            <span aria-hidden="true" className="text-ink-faint">
              &rarr;
            </span>
          )}
          <MasteryBadge level={finalMastery} />
        </div>
      )}

      {video && gateActive && (
        // Stuck + a video exists: the refresher is mandatory. The continue button below stays
        // disabled until the panel has been opened AND VIDEO_GATE_SECONDS of watch time have
        // elapsed — plain client state, no YouTube JS API involved (see the countdown effect in
        // PersistedPracticeLoop). Refreshing the page re-arms this gate from scratch.
        <div className="space-y-3 rounded-xl border border-focus bg-surface-2 p-5 text-left">
          <Eyebrow>Watch a quick refresher</Eyebrow>
          <p className="text-sm text-ink-muted">Watch the refresher to continue.</p>
          {videoOpened ? (
            <>
              <VideoEmbed video={video} />
              <button
                type="button"
                onClick={onCloseVideo}
                className="text-sm font-medium text-focus underline-offset-4 hover:underline"
              >
                Hide video
              </button>
            </>
          ) : (
            <button type="button" onClick={onOpenVideo} className={buttonClasses("secondary", "md")}>
              Play refresher video
            </button>
          )}
        </div>
      )}

      {video?.embedUrl && !gateActive && (
        // Not stuck (or stuck with no playable video — see gateActive above): the refresher is
        // always optional and never gates a clean run. Only shown when the video can embed inline.
        <details className="rounded-xl border border-border bg-surface-2 p-4 text-left">
          <summary className="cursor-pointer text-sm font-medium text-focus">Want a refresher anyway?</summary>
          <div className="mt-3">
            <VideoEmbed video={video} />
          </div>
        </details>
      )}

      <div className="flex flex-col items-center gap-3">
        {continueLocked ? (
          <button type="button" disabled className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
            {`Keep watching — unlocks in ${formatGateCountdown(remainingSeconds)}`}
          </button>
        ) : (
          <>
            <Link href={primaryHref} className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
              {primaryLabel}
            </Link>
            {/* The attempt-by-attempt summary page is also "moving on", so it sits behind the
                same gate as the primary action rather than offering a way around the refresher. */}
            <Link href={summaryHref} className="text-sm font-medium text-focus underline-offset-4 hover:underline">
              See the question-by-question summary
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
