// Teacher-facing response evidence. This component deliberately accepts a small,
// sanitized DTO: it can show a submitted response and result, but has no access to
// answer keys, tutor content, student work-help text, or uploaded files.
import { Badge, Card } from "@/components/ui";
import type { TeacherAttemptEvidence } from "@/lib/types";
import React from "react";

export type TeacherEvidenceSubskill = {
  id: string;
  name: string;
};

const CONTEXT_LABEL: Record<TeacherAttemptEvidence["context"], string> = {
  diagnostic: "Diagnostic",
  practice: "Focused practice"
};

/**
 * Shows the response history supplied by the caller beneath each requested skill.
 * Evidence is rendered in its supplied order; callers provide newest-first results.
 */
export function ResponseEvidence({
  subskills,
  evidenceBySubskill
}: {
  subskills: TeacherEvidenceSubskill[];
  evidenceBySubskill: Record<string, TeacherAttemptEvidence[]>;
}) {
  return (
    <section aria-labelledby="response-evidence-heading" className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-ink" id="response-evidence-heading">
          Response evidence
        </h3>
        <p className="text-sm text-ink-muted">
          Recent submitted answers, shown newest first for each skill.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {subskills.map((subskill) => {
          // Repository data is already newest-first. Do not sort it here; sorting can
          // silently diverge from the order a teacher sees elsewhere in the dashboard.
          const subskillEvidence = evidenceBySubskill[subskill.id] ?? [];

          return (
            <Card className="!bg-elevated p-4" key={subskill.id}>
              <h4 className="text-sm font-semibold text-ink">{subskill.name}</h4>
              {subskillEvidence.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted" role="status">
                  No submitted responses for this skill yet.
                </p>
              ) : (
                <ol aria-label={`Response evidence for ${subskill.name}`} className="mt-3 space-y-3">
                  {subskillEvidence.map((response) => (
                    <li className="border-t border-border pt-3 first:border-t-0 first:pt-0" key={response.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{CONTEXT_LABEL[response.context]}</Badge>
                        <Badge tone={response.isCorrect ? "mastered" : "support"}>
                          {response.isCorrect ? "Correct" : "Needs follow-up"}
                        </Badge>
                      </div>
                      <dl className="mt-2 space-y-2 text-sm">
                        <div>
                          <dt className="font-medium text-ink-muted">Question</dt>
                          <dd className="mt-0.5 text-ink">{response.prompt}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-ink-muted">Student answer</dt>
                          <dd className="mt-0.5 text-ink">
                            {response.answerRaw.trim() || "No answer submitted."}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
