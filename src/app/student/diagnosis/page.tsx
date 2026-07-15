"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, Eyebrow, PageHeader, buttonClasses } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";

type CompletedDiagnostic = {
  diagnosis: { selectedSubskillId: string; misconceptionTag: string; observation: string; explanation: string; nextStep: string; explanationSource: string };
  practiceSession: { id: string; status: "active"; firstItemId: string | null; itemCount: number };
};

function DiagnosisContent() {
  const params = useSearchParams();
  const diagnosticSessionId = params.get("diagnosticSessionId");
  const [result, setResult] = useState<CompletedDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!diagnosticSessionId) {
      setError("Complete the diagnostic before viewing your next step.");
      return;
    }
    fetch(`/api/diagnostics/${canonicalDemoIds.diagnosticAssignmentId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: canonicalDemoIds.mayaStudentId, diagnosticSessionId }),
    }).then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setResult)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not create practice"));
  }, [diagnosticSessionId]);

  return (
    <AppShell active="student">
      <section className="max-w-2xl">
        <PageHeader eyebrow="Diagnostic complete" title="Here’s your next useful step" description="This is not a grade. It is the skill that will make your next fraction problems easier." />
        {!result && <Card className="p-5"><p className="text-ink-muted">{error ?? "Creating your focused practice…"}</p></Card>}
        {result && <>
          <div className="space-y-4">
            <Card className="p-5"><Eyebrow className="mb-2">What we noticed</Eyebrow><p className="text-ink">{result.diagnosis.observation}</p><p className="mt-2 text-ink-muted">{result.diagnosis.explanation}</p></Card>
            <div className="rounded-xl border border-accent bg-accent-soft p-5"><Eyebrow className="mb-2">Next step</Eyebrow><p className="text-ink">{result.diagnosis.nextStep}</p></div>
          </div>
          <div className="mt-8 flex justify-end"><Link href={`/student/practice/${result.practiceSession.id}`} className={buttonClasses("primary", "md")}>Start {result.practiceSession.itemCount}-question practice</Link></div>
        </>}
      </section>
    </AppShell>
  );
}

export default function DiagnosisPage() {
  return <Suspense fallback={<AppShell active="student"><section className="max-w-2xl"><p className="text-ink-muted">Loading your diagnosis…</p></section></AppShell>}><DiagnosisContent /></Suspense>;
}
