"use client";

// Minimal client bridge from the diagnostic screen to the response and completion API routes.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnswerInput } from "@/components/student/answer-input";

const mayaId = "maya-chen";
const assignmentId = "fractions-diagnostic-v1";

export function DiagnosticFlow() {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(answer: string) {
    setLoading(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/responses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: mayaId, itemId: "diagnostic-add-unlike-1", answer, context: "diagnostic", assignmentId }) });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not save your answer.");
      const completion = await fetch(`/api/diagnostics/${assignmentId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: mayaId }) });
      const data = await completion.json();
      if (!completion.ok) throw new Error(data.error ?? "Could not complete the diagnostic.");
      sessionStorage.setItem("rung-diagnosis", JSON.stringify(data.diagnosis));
      router.push(`/student/diagnosis?sessionId=${encodeURIComponent(data.practiceSession.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <><p className="rounded bg-surface-2 p-4">1/1 · What is 1/3 + 1/4?</p><div className="mt-4"><AnswerInput onSubmit={submit} disabled={loading} /></div>{message && <p className="mt-3 text-sm text-danger" role="alert">{message}</p>}</>;
}
