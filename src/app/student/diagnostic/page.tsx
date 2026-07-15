"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AnswerInput } from "@/components/student/answer-input";
import { ProgressIndicator } from "@/components/student/progress-indicator";
import { Badge, Eyebrow, buttonClasses } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";

type DiagnosticItem = { id: string; prompt: string; subskillId: string; position: number };
type Diagnostic = { diagnosticSessionId: string; assignmentId: string; items: DiagnosticItem[] };

export default function DiagnosticPage() {
  const router = useRouter();
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [index, setIndex] = useState(0);
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/diagnostics/${canonicalDemoIds.diagnosticAssignmentId}?studentId=${canonicalDemoIds.mayaStudentId}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setDiagnostic)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not start diagnostic"));
  }, []);

  const item = diagnostic?.items[index];
  const isLastItem = Boolean(diagnostic && index === diagnostic.items.length - 1);

  async function handleSubmit(answer: string) {
    if (!diagnostic || !item) return;
    setError(null);
    const response = await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: canonicalDemoIds.mayaStudentId, diagnosticSessionId: diagnostic.diagnosticSessionId, itemId: item.id, answer, context: "diagnostic" }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not record answer");
      return;
    }
    setRecorded(true);
  }

  function handleNext() {
    if (!diagnostic) return;
    if (isLastItem) {
      router.push(`/student/diagnosis?diagnosticSessionId=${diagnostic.diagnosticSessionId}`);
      return;
    }
    setIndex((current) => current + 1);
    setRecorded(false);
  }

  return (
    <AppShell active="student">
      <section className="max-w-2xl space-y-8">
        <div>
          <Eyebrow className="mb-2">Fractions check-in</Eyebrow>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Diagnostic</h1>
          <p className="mt-3 text-ink-muted">A few questions to see what will be most useful to practice next.</p>
        </div>
        {!diagnostic && <p className="text-ink-muted">{error ?? "Loading your diagnostic…"}</p>}
        {diagnostic && item && (
          <>
            <ProgressIndicator completed={index} total={diagnostic.items.length} label="Question" />
            <div className="space-y-5 rounded-xl border border-border bg-surface p-6">
              <Badge tone="neutral">Item {index + 1} of {diagnostic.items.length}</Badge>
              <p className="text-2xl font-semibold tracking-tight text-ink">{item.prompt}</p>
              <AnswerInput key={item.id} label={`Your answer to ${item.prompt}`} disabled={recorded} onSubmit={handleSubmit} />
              {recorded && <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink-muted">Answer recorded.</p>}
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
            <div className="flex justify-end"><button type="button" disabled={!recorded} onClick={handleNext} className={buttonClasses("primary", "md", !recorded ? "pointer-events-none opacity-50" : undefined)}>{isLastItem ? "See my results" : "Next"}</button></div>
          </>
        )}
      </section>
    </AppShell>
  );
}
