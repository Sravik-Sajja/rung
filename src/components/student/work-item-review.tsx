// Shared answer-safe review of a single scored item: the prompt, every attempt the student made
// (so a retry is never hidden), and the correct answer. Used by both the My Work page (WS4a) and
// the diagnosis item reveal (WS4b) so the two answer-safe surfaces render items identically.
//
// This only ever receives items from `StudentWorkSession`, which the WS1 API routes only ever
// populate for already-completed, already-scored sessions — see `src/lib/student/work-history.ts`.
// Do not reuse this component anywhere a session might still be in flight.
import { Badge } from "@/components/ui";
import { FractionExpression } from "@/components/student/fraction";
import { NumberLineQuestion } from "@/components/student/number-line-question";
import type { StudentWorkItem } from "@/lib/student/work-history";
import type { ItemVisualSpec } from "@/lib/types";

export type WorkItemGroup = {
  itemId: string;
  prompt: string;
  visualSpec?: ItemVisualSpec;
  correctAnswer: string;
  /** All attempts for this item within the session, oldest first. */
  attempts: StudentWorkItem[];
};

/**
 * Groups a session's flat item list (one entry per attempt, per `work-history.ts`) by item id, in
 * first-seen order, so a retried item renders as one question block with its attempts listed in
 * order rather than as duplicate question cards.
 */
export function groupItemsById(items: readonly StudentWorkItem[]): WorkItemGroup[] {
  const order: string[] = [];
  const byId = new Map<string, StudentWorkItem[]>();
  for (const item of items) {
    if (!byId.has(item.itemId)) {
      byId.set(item.itemId, []);
      order.push(item.itemId);
    }
    byId.get(item.itemId)!.push(item);
  }
  return order.map((itemId) => {
    const attempts = [...byId.get(itemId)!].sort((left, right) => (left.attempt ?? 0) - (right.attempt ?? 0));
    const latest = attempts[attempts.length - 1]!;
    return {
      itemId,
      prompt: latest.prompt,
      visualSpec: latest.visualSpec,
      correctAnswer: latest.correctAnswer,
      attempts,
    };
  });
}

/** Readable date for a session's `completedAt` ISO timestamp — shared by the My Work page and the
 * diagnosis item reveal so both surfaces format dates identically. */
export function formatCompletedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function WorkItemReview({ group }: { group: WorkItemGroup }) {
  const hasRetries = group.attempts.length > 1;
  return (
    <li className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <FractionExpression text={group.prompt} size="md" />
      {group.visualSpec?.kind === "number_line" && (
        <div className="mt-3">
          <NumberLineQuestion visualSpec={group.visualSpec} />
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {group.attempts.map((attempt) => (
          <li key={attempt.attempt ?? 0} className="flex flex-wrap items-center gap-2 text-sm">
            {hasRetries && (
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-ink-faint">
                Attempt {attempt.attempt}
              </span>
            )}
            <span className="font-semibold tabular-nums text-ink">
              {attempt.answerRaw.trim() || "No answer submitted."}
            </span>
            <Badge tone={attempt.isCorrect ? "mastered" : "support"}>{attempt.isCorrect ? "Correct" : "Not yet"}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-ink-muted">
        Correct answer: <span className="font-semibold tabular-nums text-ink">{group.correctAnswer}</span>
      </p>
    </li>
  );
}
