"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui";

type CreateParticipantResponse = {
  participant?: { studentId?: string };
  error?: string;
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
        We&rsquo;ll use this only for this temporary walkthrough.
      </p>
      <button type="submit" disabled={submitting || !displayName.trim()} className={buttonClasses("focus", "lg", "w-full sm:w-72")}>
        {submitting ? "Starting your climb…" : "Start the climb"}
      </button>
      {error && <p className="w-full text-left text-sm text-danger" role="alert">{error}</p>}
    </form>
  );
}
