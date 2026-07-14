"use client";

import { useState } from "react";

export function AnswerInput({
  onSubmit,
  disabled = false,
  label = "Your answer",
}: {
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [answer, setAnswer] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = answer.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
    <label className="sr-only" htmlFor="student-answer">{label}</label>
    <input
      id="student-answer"
      value={answer}
      onChange={(event) => setAnswer(event.target.value)}
      disabled={disabled}
      placeholder="For example, 7/12"
      className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100"
    />
    <button type="submit" disabled={disabled || !answer.trim()} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400">
      Check answer
    </button>
  </form>;
}
