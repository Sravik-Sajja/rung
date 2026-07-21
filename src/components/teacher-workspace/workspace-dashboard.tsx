"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardView } from "@/components/teacher/dashboard-view";
import { Button, Card } from "@/components/ui";
import { groupStudentsByNeed } from "@/lib/teacher/grouping";
import type { TeacherDashboard } from "@/lib/types";
import type { TeacherWorkspace } from "@/lib/teacher-workspace/session";

export function TeacherWorkspaceDashboard({
  workspace,
  responseEvidenceByStudent,
  assignedFollowUps,
}: {
  workspace: TeacherWorkspace;
  responseEvidenceByStudent?: TeacherDashboard["responseEvidenceByStudent"];
  /** Existing teacher-origin plans for this roster (WS1a item 6), threaded straight onto the
   * `dashboard` object below purely as data. DashboardView reads it to seed its assigned-follow-up
   * Set; this component only supplies the fetch that persists new assignments (`persistFollowUp`). */
  assignedFollowUps?: TeacherDashboard["assignedFollowUps"];
}) {
  const [ending, setEnding] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const codeCopiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkCopiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (codeCopiedTimeout.current) clearTimeout(codeCopiedTimeout.current);
      if (linkCopiedTimeout.current) clearTimeout(linkCopiedTimeout.current);
    };
  }, []);
  async function endWorkspace() {
    setEnding(true);
    await fetch("/api/teacher-workspace/session", { method: "DELETE" });
    window.location.reload();
  }

  async function persistFollowUp(studentId: string, subskillId: string) {
    const response = await fetch(`/api/teacher-workspace/students/${encodeURIComponent(studentId)}/assign-practice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subskillId }),
    });
    const body = await response.json().catch(() => ({})) as { alreadyAssigned?: boolean; error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "Could not assign that follow-up.");
    }
    return { alreadyAssigned: Boolean(body.alreadyAssigned) };
  }

  async function removeStudent(studentId: string) {
    setRemovingStudentId(studentId);
    setRemoveError(null);
    try {
      const response = await fetch(`/api/teacher-workspace/students/${encodeURIComponent(studentId)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Could not remove that student.");
      }
      // The roster and every heatmap cell are server-rendered from the class,
      // so reload rather than trying to prune them here.
      window.location.reload();
    } catch (reason) {
      setRemoveError(reason instanceof Error ? reason.message : "Could not remove that student.");
      setRemovingStudentId(null);
    }
  }
  const joinCode = workspace.joinCode;
  const joinPath = joinCode ? `/join-class?joinCode=${encodeURIComponent(joinCode)}` : "/join-class";
  const joinLink = typeof window === "undefined" ? joinPath : `${window.location.origin}${joinPath}`;
  async function copyJoinCode() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCodeCopied(true);
      setAnnouncement("Join code copied");
      if (codeCopiedTimeout.current) clearTimeout(codeCopiedTimeout.current);
      codeCopiedTimeout.current = setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(false);
    }
  }
  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinLink);
      setLinkCopied(true);
      setAnnouncement("Join link copied");
      if (linkCopiedTimeout.current) clearTimeout(linkCopiedTimeout.current);
      linkCopiedTimeout.current = setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
    }
  }

  // A workspace carries the same shape the sample class dashboard renders, so
  // it reuses that view rather than keeping a second, thinner heatmap.
  const dashboard: TeacherDashboard = useMemo(() => ({
    classId: workspace.classId,
    students: workspace.students,
    subskills: workspace.subskills,
    cells: workspace.cells,
    groups: groupStudentsByNeed(workspace.cells),
    // Without this the student detail pane reports "no submitted responses"
    // for a learner whose mastery came from those very responses.
    responseEvidenceByStudent,
    assignedFollowUps,
  }), [responseEvidenceByStudent, assignedFollowUps, workspace]);

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{workspace.className}</h1>
          <p className="mt-2 text-ink-muted">{workspace.teacherDisplayName}&rsquo;s class</p>
        </div>
        <Button variant="secondary" onClick={endWorkspace} disabled={ending}>{ending ? "Ending…" : "End workspace"}</Button>
      </div>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink">Invite a student to your class</h2>
          <p className="mt-1 text-sm text-ink-muted">Students use this code to begin the class check-in. It expires when this workspace ends.</p>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          {joinCode ? (
            <button
              type="button"
              aria-label="Copy join code"
              onClick={copyJoinCode}
              className="group inline-flex items-center gap-3 rounded-lg border border-border-strong bg-elevated px-5 py-3 shadow-md font-mono text-lg font-bold tracking-[0.12em] text-ink transition-colors hover:border-accent sm:text-xl"
            >
              {joinCode}
              {codeCopied ? (
                <span className="font-sans text-xs font-semibold tracking-normal text-accent">Copied ✓</span>
              ) : (
                <span className="text-ink-faint transition-colors group-hover:text-accent">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                  </svg>
                </span>
              )}
            </button>
          ) : null}
          {joinCode ? <p className="text-xs text-ink-faint">Click the code to copy it</p> : null}
          <div className="flex items-center gap-3">
            <button type="button" onClick={copyJoinLink} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
              {linkCopied ? "Link copied ✓" : "Copy join link"}
            </button>
            <span aria-hidden="true" className="text-border-strong">·</span>
            <a href={joinPath} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
              Open join page <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </div>
        <span aria-live="polite" className="sr-only">{announcement}</span>
      </Card>
      {workspace.students.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="text-lg font-semibold text-ink">No students yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            Share the join code above. Students appear here as they join, and their mastery fills in as they work through the check-in.
          </p>
        </Card>
      ) : (
        <>
          {removeError ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{removeError}</p> : null}
          <DashboardView
            dashboard={dashboard}
            onPersistFollowUp={persistFollowUp}
            onRemoveStudent={removeStudent}
            removingStudentId={removingStudentId}
          />
        </>
      )}
      <p className="text-sm text-ink-faint">The cookie only resumes this non-production demo workspace. It is not a Supabase Auth session and must not be used for real classroom data.</p>
    </div>
  );
}
