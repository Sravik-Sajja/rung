"use client";

import { useRef, useState } from "react";
import { Card, Eyebrow, buttonClasses, cn } from "@/components/ui";

/** The two support rungs from which a student can ask for work-based help. */
export type WorkHelpSupportLevel = "hint" | "guided_step";

/**
 * The answer-safe explanation returned by POST /api/work-help.
 *
 * The route is responsible for validating the work, analysing an optional image, and
 * ensuring these fields do not reveal the answer. Keeping the display shape explicit
 * lets a page use this component without knowing anything about the AI implementation.
 */
export type WorkHelpResponse = {
  observation: string;
  nextStep: string;
  checkQuestion: string;
};

export type WorkHelpCardProps = {
  /** Resolved on the server in production; passed here for the demo API contract. */
  studentId: string;
  itemId: string;
  /** The server resolves the trusted item from this exact practice occurrence. */
  practiceSessionId: string;
  practiceSessionItemId: string;
  supportLevel: WorkHelpSupportLevel;
  /** Optional handoff for a parent that wants to retain the latest answer-safe help. */
  onResponse?: (response: WorkHelpResponse) => void;
  disabled?: boolean;
  className?: string;
};

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Keep this in lockstep with POST /api/work-help. Rejecting it here prevents a
// learner from waiting on a request the server must reject.
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

function parseWorkHelpResponse(value: unknown): WorkHelpResponse | null {
  if (!value || typeof value !== "object") return null;

  const response = value as Partial<WorkHelpResponse>;
  if (
    typeof response.observation !== "string" ||
    typeof response.nextStep !== "string" ||
    typeof response.checkQuestion !== "string"
  ) {
    return null;
  }

  return {
    observation: response.observation,
    nextStep: response.nextStep,
    checkQuestion: response.checkQuestion,
  };
}

/**
 * A private, answer-safe escalation after a student has used a hint but is still stuck.
 * It deliberately owns no scoring, peer-example, or unlock state: it only submits the
 * student's work and presents the route's observation plus one next step.
 */
export function WorkHelpCard({
  studentId,
  itemId,
  practiceSessionId,
  practiceSessionItemId,
  supportLevel,
  onResponse,
  disabled = false,
  className,
}: WorkHelpCardProps) {
  const [writtenWork, setWrittenWork] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [response, setResponse] = useState<WorkHelpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = !disabled && !loading && Boolean(writtenWork.trim());

  function removePhoto() {
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function selectPhoto(file: File | null) {
    setError(null);

    if (!file) {
      removePhoto();
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      removePhoto();
      setError("Choose a JPG, PNG, or WebP image of your work.");
      return;
    }

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      removePhoto();
      setError("Choose an image 5 MB or smaller.");
      return;
    }

    setPhoto(file);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedWork = writtenWork.trim();
    if (!trimmedWork || disabled || loading) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("studentId", studentId);
      formData.set("itemId", itemId);
      formData.set("practiceSessionId", practiceSessionId);
      formData.set("practiceSessionItemId", practiceSessionItemId);
      formData.set("supportLevel", supportLevel);
      formData.set("writtenWork", trimmedWork);
      if (photo) formData.set("photo", photo);

      const result = await fetch("/api/work-help", {
        method: "POST",
        body: formData,
      });
      const body: unknown = await result.json().catch(() => null);

      if (!result.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "We could not review your work. Please try again.";
        throw new Error(message);
      }

      const nextResponse = parseWorkHelpResponse(body);
      if (!nextResponse) {
        throw new Error("We received help in an unexpected format. Please try again.");
      }

      setResponse(nextResponse);
      onResponse?.(nextResponse);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not review your work. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={cn("p-6", className)} aria-labelledby="work-help-title">
      <Eyebrow className="mb-1">Still stuck?</Eyebrow>
      <h2 id="work-help-title" className="text-xl font-bold tracking-tight text-ink">
        Show your work
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Tell us what you tried and we&apos;ll point out one useful next step, without giving away the answer.
      </p>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div>
          <label className="block text-sm font-semibold text-ink" htmlFor={`work-help-written-${itemId}`}>
            What have you tried?
          </label>
          <textarea
            id={`work-help-written-${itemId}`}
            value={writtenWork}
            disabled={disabled || loading}
            onChange={(event) => setWrittenWork(event.target.value)}
            className="mt-2 min-h-24 w-full rounded-md border border-border bg-surface-2 p-3 text-ink placeholder:text-ink-faint disabled:opacity-60"
            placeholder="For example: I tried rewriting 1/3 as something over 12, but I am not sure what to do next."
            required
          />
        </div>

        <div className="rounded-md border border-dashed border-border p-3">
          <label className="block cursor-pointer text-sm font-semibold text-ink" htmlFor={`work-help-photo-${itemId}`}>
            Add a photo of your work <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <p className="mt-1 text-sm text-ink-muted">
            Your photo is analyzed only for this help request and is not saved.
          </p>
          <input
            ref={photoInputRef}
            id={`work-help-photo-${itemId}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={disabled || loading}
            onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-semibold file:text-ink hover:file:bg-border disabled:opacity-60"
          />
          {photo && (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm text-ink">
              <span className="truncate">Attached: {photo.name}</span>
              <button
                type="button"
                onClick={removePhoto}
                disabled={loading || disabled}
                className="text-accent underline disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <button type="submit" disabled={!canSubmit} className={buttonClasses("focus", "md")}>
          {loading ? "Reviewing your work…" : "Get a next step"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {response && (
        <div className="animate-rise mt-5 space-y-3 rounded-md border border-border-strong bg-elevated p-4" aria-live="polite">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">What I notice</p>
            <p className="mt-1 text-ink">{response.observation}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Try this next</p>
            <p className="mt-1 text-ink">{response.nextStep}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Check yourself</p>
            <p className="mt-1 text-ink">{response.checkQuestion}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
