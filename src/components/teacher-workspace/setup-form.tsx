"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

export function TeacherWorkspaceSetupForm() {
  const [teacherDisplayName, setTeacherDisplayName] = useState("");
  const [className, setClassName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/teacher-workspace/session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherDisplayName, className }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not start the teacher workspace.");
      window.location.reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start the teacher workspace."); }
    finally { setSubmitting(false); }
  }

  return (
    <Card className="mx-auto max-w-lg p-6 sm:p-8">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Set up a fictional class</h1>
      <p className="mt-3 text-ink-muted">This creates a workspace with a fictional roster and starter mastery evidence. It is not sign-in or production teacher access.</p>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block text-sm font-medium text-ink">Your display name
          <input required maxLength={48} value={teacherDisplayName} onChange={(event) => setTeacherDisplayName(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-ink outline-none focus:border-accent" placeholder="Ms. Jordan" />
        </label>
        <label className="block text-sm font-medium text-ink">Class name
          <input required maxLength={80} value={className} onChange={(event) => setClassName(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-ink outline-none focus:border-accent" placeholder="Period 3 fractions" />
        </label>
        {error ? <p className="rounded-md bg-focus-soft px-3 py-2 text-sm text-focus">{error}</p> : null}
        <Button className="w-full" disabled={submitting} type="submit">{submitting ? "Creating workspace…" : "Open teacher workspace"}</Button>
      </form>
    </Card>
  );
}
