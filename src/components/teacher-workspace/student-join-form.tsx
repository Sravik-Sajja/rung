"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Eyebrow } from "@/components/ui";

type JoinResponse = {
  student?: { studentId?: string; assignmentId?: string; className?: string };
  error?: string;
};
type PreviewResponse = {
  workspace?: { className: string; teacherDisplayName: string; assignmentTitle: string } | null;
  signedInAs?: { displayName: string } | null;
};

const JOIN_CODE_PLACEHOLDER = "A3F9-2B71-C4D8";
const GENERIC_JOIN_ERROR = "We could not join that class. Check the code and try again.";

/**
 * Starts a learner session inside a teacher's demo workspace. A visitor who is
 * already partway through the public walkthrough keeps that learner and simply
 * gains the class, so the form gives way to a confirm step for them.
 */
export function StudentJoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [joinCode, setJoinCode] = useState(() => params.get("joinCode") ?? "");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(() => Boolean(params.get("joinCode")));
  const [signingOut, setSigningOut] = useState(false);

  const linkedCode = params.get("joinCode");
  useEffect(() => {
    // Only a code that arrived in the link can be confirmed without typing.
    if (!linkedCode) return;
    let active = true;
    setLoadingPreview(true);
    fetch(`/api/teacher-workspace/join-preview?joinCode=${encodeURIComponent(linkedCode)}`)
      .then((response) => response.json() as Promise<PreviewResponse>)
      .then((body) => { if (active) setPreview(body); })
      .catch(() => { if (active) setPreview(null); })
      .finally(() => { if (active) setLoadingPreview(false); });
    return () => { active = false; };
  }, [linkedCode]);

  async function join(payload: Record<string, string>) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/teacher-workspace/student-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as JoinResponse;
      const studentId = body.student?.studentId;
      const assignmentId = body.student?.assignmentId;
      if (!response.ok || !studentId || !assignmentId) throw new Error(body.error ?? GENERIC_JOIN_ERROR);
      router.push(`/student/diagnostic?studentId=${encodeURIComponent(studentId)}&assignmentId=${encodeURIComponent(assignmentId)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : GENERIC_JOIN_ERROR);
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    await join({ joinCode: joinCode.trim().toUpperCase(), displayName: displayName.trim() });
  }

  /**
   * "Not you?" means this browser is a different learner now, so both identities
   * go: the walkthrough participant that names them here, and any joined-class
   * session it holds. Clearing only the joined session left the participant
   * cookie intact, so the screen still greeted the previous learner.
   */
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const [participant, joined] = await Promise.all([
        fetch("/api/demo/participant", { method: "DELETE" }),
        fetch("/api/teacher-workspace/student-session", { method: "DELETE" }),
      ]);
      if (!participant.ok || !joined.ok) throw new Error();
      setPreview((current) => (current ? { ...current, signedInAs: null } : current));
    } catch {
      setError("Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  if (loadingPreview) {
    return <Card className="mx-auto max-w-lg rounded-2xl border border-border bg-elevated p-6 shadow-lg sm:p-8"><p className="text-ink-muted">Loading class join…</p></Card>;
  }

  const signedInAs = preview?.signedInAs;
  const workspace = preview?.workspace;
  if (signedInAs && workspace && linkedCode) {
    const firstName = signedInAs.displayName.trim().split(/\s+/)[0] ?? signedInAs.displayName;
    return (
      <Card className="mx-auto max-w-lg rounded-2xl border border-border bg-elevated p-6 shadow-lg sm:p-8">
        <Eyebrow>Join class</Eyebrow>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Join {workspace.teacherDisplayName}&rsquo;s class?</h1>
        <div className="mt-5 flex items-center gap-3">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent" aria-hidden="true">
            {signedInAs.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">You&rsquo;re signed in as {signedInAs.displayName}</p>
            <p className="text-sm text-ink-muted">You&rsquo;ll keep your current climb.</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="shrink-0 text-xs font-medium text-ink-faint underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
          >
            Not {firstName}? Sign out
          </button>
        </div>
        <div className="mt-5 border-l-2 border-spark pl-4">
          <p className="text-sm font-semibold text-spark-ink">A fresh start</p>
          <p className="mt-1 text-sm text-ink-muted">
            This class starts fresh. Your teacher sees only the work you do here, not your walkthrough.
          </p>
        </div>
        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-ink-muted">Class</dt><dd className="text-ink">{workspace.className}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-muted">Check-in</dt><dd className="text-ink">{workspace.assignmentTitle}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-muted">Join code</dt><dd><span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs tracking-wider text-ink">{linkedCode.toUpperCase()}</span></dd></div>
        </dl>
        {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}
        <Button className="mt-6 w-full" disabled={submitting} onClick={() => join({ joinCode: linkedCode.trim().toUpperCase() })} type="button">
          {submitting ? "Joining class…" : `Join class as ${signedInAs.displayName}`}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg rounded-2xl border border-border bg-elevated p-6 shadow-lg sm:p-8">
      <Eyebrow>Join class</Eyebrow>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Join your class</h1>
      <p className="mt-3 text-ink-muted">Enter the join code your teacher shared. This opens a practice check-in, not a real classroom account.</p>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block text-sm font-medium text-ink" htmlFor="join-code">Class join code
          <input id="join-code" name="joinCode" required autoCapitalize="characters" maxLength={32} value={joinCode} onChange={(event) => setJoinCode(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-center font-mono uppercase tracking-[0.1em] text-ink outline-none focus:border-accent" placeholder={JOIN_CODE_PLACEHOLDER} disabled={submitting} />
        </label>
        <label className="block text-sm font-medium text-ink" htmlFor="student-display-name">Your display name
          <input id="student-display-name" name="displayName" required maxLength={48} autoComplete="given-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-ink outline-none focus:border-accent" placeholder="First name or nickname" disabled={submitting} />
        </label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <Button className="w-full" disabled={submitting || !joinCode.trim() || !displayName.trim()} type="submit">{submitting ? "Joining class…" : "Join class"}</Button>
      </form>
    </Card>
  );
}
