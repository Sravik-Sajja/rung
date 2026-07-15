// Post-answer feedback for the student surface: a celebratory win, or an encouraging not-yet. Never shaming.
// A correct answer is the moment the student-surface should feel most alive, so it pops in green
// (the "correct/achieved" signal) and lifts to shadow-lg — a small gold bolt is layered on as a
// reward flourish, not the whole state. The miss state stays quiet and recessed (shadow-sm, neutral
// surface) so the contrast between the two reads as momentum, not noise.
import { cn } from "@/components/ui";

export function WinFeedback({
  correct,
  message
}: {
  correct: boolean;
  message?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "animate-pop rounded-xl border p-4",
        correct ? "border-accent bg-accent-soft shadow-lg" : "border-border bg-surface-2 shadow-sm"
      )}
    >
      <p className={cn("flex items-center gap-2 text-lg font-bold", correct ? "text-accent" : "text-ink")}>
        {correct && (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 fill-spark">
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
          </svg>
        )}
        {correct ? "Boom — you leveled up this skill." : "Not yet — you've got this."}
      </p>
      {message ? <p className="mt-1 text-sm text-ink-muted">{message}</p> : null}
    </div>
  );
}
