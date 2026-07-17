"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui";

type CreateParticipantResponse = {
  participant?: { studentId?: string };
  error?: string;
};

type ResumeParticipantResponse = {
  participant?: { studentId: string; displayName: string };
  resume?: { kind: "start" | "diagnostic" | "diagnosis" | "practice" | "mastery"; nextPath: string };
};

/**
 * Creates a temporary demo learner on the server. The returned ID travels in
 * the walkthrough URL only as a consistency assertion; the httpOnly cookie
 * remains the authority checked by every student route.
 */
export function StartClimbForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<ResumeParticipantResponse | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/demo/participant", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body: ResumeParticipantResponse | null) => {
        if (active && body?.participant && body.resume) setExisting(body);
      })
      // A missing/expired cookie is the normal new-learner state. The form
      // remains usable if the resume check has a transient network failure.
      .catch(() => undefined)
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  async function startClimb(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const body = await response.json().catch(() => ({})) as CreateParticipantResponse;
      const studentId = body.participant?.studentId;
      if (!response.ok || !studentId) {
        throw new Error(body.error ?? "We could not start your climb. Try again.");
      }
      router.push(`/student/diagnostic?studentId=${encodeURIComponent(studentId)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not start your climb. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * This screen greets either learner kind. The DELETE endpoint ends every
   * learner session held by this browser, not just the participant one, so a
   * single call covers a learner who had also joined a class.
   */
  async function signOut() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/participant", { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "Could not sign out.");
      setExisting(null);
      setDisplayName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return <p className="text-sm text-ink-muted">Checking for your climb&hellip;</p>;
  }

  if (existing?.participant && existing.resume) {
    const actionLabel = existing.resume.kind === "practice" || existing.resume.kind === "diagnosis"
      ? "Choose my practice"
      : existing.resume.kind === "mastery"
        ? "See my progress"
        : "Continue my climb";
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <p className="text-lg font-semibold text-ink">Welcome back, {existing.participant.displayName}.</p>
        <p className="text-sm text-ink-muted">
          Your session is still active. We&rsquo;ll show the skills from your diagnostic that are not mastered yet.
        </p>
        <button type="button" onClick={() => router.push(existing.resume!.nextPath)} className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
          {actionLabel}
        </button>
        <button type="button" onClick={signOut} disabled={submitting} className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-60">
          Sign out and start a different climb
        </button>
        {error && <p className="w-full text-left text-sm text-danger" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form className="flex w-full flex-col items-center gap-4" onSubmit={startClimb}>
      <label className="w-full text-left text-sm font-semibold text-ink" htmlFor="demo-display-name">
        What should we call you?
      </label>
      <input
        id="demo-display-name"
        name="displayName"
        autoComplete="given-name"
        maxLength={32}
        required
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        disabled={submitting}
        placeholder="First name or nickname"
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-3 text-ink placeholder:text-ink-faint focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30 disabled:opacity-60"
      />
      <p className="w-full text-left text-sm text-ink-muted">
        We&rsquo;ll use this only to personalize your practice.
      </p>
      <button type="submit" disabled={submitting || !displayName.trim()} className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
        {submitting ? "Starting your climb…" : "Start the climb"}
      </button>
      {error && <p className="w-full text-left text-sm text-danger" role="alert">{error}</p>}
    </form>
  );
}
