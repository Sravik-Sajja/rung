"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudentShell } from "@/components/student/surface/student-shell";
import { RungProgress } from "@/components/student/surface/rung-progress";
import { MasteryBadge } from "@/components/student/mastery-badge";
import { Card, Eyebrow, buttonClasses, cn } from "@/components/ui";
import { canonicalDemoIds } from "@/lib/demo/contracts";
import type { MasteryLevel } from "@/lib/types";

type Mastery = { skills: Array<{ subskillId: string; name: string; level: MasteryLevel; message: string; willComeBack: boolean }> };

function MasteryContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId");
  const router = useRouter();
  const [mastery, setMastery] = useState<Mastery | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!studentId) {
      router.replace("/demo");
      return;
    }
    fetch(`/api/students/${encodeURIComponent(studentId)}/mastery?topicId=${canonicalDemoIds.fractionsTopicId}`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error((await response.json()).error)))
      .then(setMastery)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load mastery"));
  }, [router, studentId]);
  if (!mastery) return <StudentShell><section className="flex-1"><p className="text-ink-muted">{error ?? "Loading your skill climb…"}</p></section></StudentShell>;
  const masteredCount = mastery.skills.filter((skill) => skill.level === "mastered").length;
  return <StudentShell><section className="flex flex-1 flex-col gap-8"><div className="max-w-lg"><Eyebrow className="mb-2">Your climb</Eyebrow><h1 className="text-3xl font-extrabold tracking-tight text-ink">Your skill climb</h1><p className="mt-3 text-ink-muted"><strong className="text-spark-ink">{masteredCount}</strong> of {mastery.skills.length} skills mastered. This is evidence from your work, not a grade.</p></div><RungProgress current={masteredCount} total={mastery.skills.length} label="Skills climbed" /><div className="flex flex-col gap-3">{mastery.skills.map((skill) => <Card key={skill.subskillId} className={cn("flex items-center justify-between gap-3 p-5", skill.level === "mastered" && "border-mastery-mastered bg-elevated")}><div><p className="text-lg font-semibold text-ink">{skill.name}</p><p className="text-sm text-ink-muted">{skill.message}</p></div><MasteryBadge level={skill.level} /></Card>)}</div><div className="flex justify-end"><Link href="/teacher/dashboard" className={buttonClasses("secondary", "md")}>Switch to teacher view</Link></div></section></StudentShell>;
}

export default function MasteryPage() {
  return <Suspense fallback={<StudentShell><section className="flex-1"><p className="text-ink-muted">Loading your skill climb…</p></section></StudentShell>}><MasteryContent /></Suspense>;
}
