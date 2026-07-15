"use client";

// Displays the server-derived diagnosis saved by the diagnostic flow and starts its returned session.
import Link from "next/link";
import { useEffect, useState } from "react";

type Diagnosis = { observation: string; nextStep: string };

export function DiagnosisResult({ sessionId }: { sessionId?: string }) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis>();

  useEffect(() => {
    const saved = sessionStorage.getItem("rung-diagnosis");
    if (saved) setDiagnosis(JSON.parse(saved) as Diagnosis);
  }, []);

  const activeSessionId = sessionId ?? "practice-maya-chen-common-denominator";
  return <><p>{diagnosis?.observation ?? "Complete the diagnostic to see your answer-pattern observation."}</p><p className="mt-2">Next step: {diagnosis?.nextStep ?? "Practice finding a common denominator before adding."}</p><Link href={`/student/practice/${activeSessionId}`} className="mt-4 inline-block rounded bg-indigo-600 px-4 py-2 text-white">Start practice</Link></>;
}
