import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it } from "vitest";
import { ResponseEvidence } from "./response-evidence";

// The app compiler supplies React's JSX runtime. Vitest runs the component through
// the legacy JSX transform, so make it available to the existing UI primitives too.
Object.assign(globalThis, { React });

describe("ResponseEvidence", () => {
  const subskills = [
    { id: "equivalent", name: "Equivalent fractions" },
    { id: "common-denominator", name: "Find a common denominator" }
  ];

  it("shows sanitized question and answer evidence in the supplied newest-first order", () => {
    const markup = renderToStaticMarkup(
      <ResponseEvidence
        subskills={subskills}
        evidenceBySubskill={{
          "common-denominator": [
            {
            id: "newest",
            itemId: "practice-item",
            prompt: "What common denominator can you use for 1/3 and 1/4?",
            answerRaw: "12",
            isCorrect: true,
            context: "practice",
            submittedAt: "2026-07-16T22:00:00.000Z"
          },
          {
            id: "older",
            itemId: "diagnostic-item",
            prompt: "Find a common denominator for 1/2 and 1/3.",
            answerRaw: "5",
            isCorrect: false,
            context: "diagnostic",
            submittedAt: "2026-07-16T21:00:00.000Z"
          }
          ]
        }}
      />
    );

    expect(markup).toContain("Focused practice");
    expect(markup).toContain("Correct");
    expect(markup).toContain("Diagnostic");
    expect(markup).toContain("Needs follow-up");
    expect(markup.indexOf("1/3 and 1/4")).toBeLessThan(markup.indexOf("1/2 and 1/3"));
    expect(markup).not.toContain("answer key");
  });

  it("renders an accessible empty state and makes blank submissions explicit", () => {
    const emptyMarkup = renderToStaticMarkup(<ResponseEvidence subskills={subskills} evidenceBySubskill={{}} />);
    expect(emptyMarkup).toContain('role="status"');
    expect(emptyMarkup).toContain("No submitted responses for this skill yet.");

    const blankAnswerMarkup = renderToStaticMarkup(
      <ResponseEvidence
        subskills={[subskills[0]]}
        evidenceBySubskill={{
          equivalent: [{
            id: "blank",
            itemId: "equivalent-item",
            prompt: "Write an equivalent fraction.",
            answerRaw: " ",
            isCorrect: false,
            context: "diagnostic",
            submittedAt: "2026-07-16T20:00:00.000Z"
          }]
        }}
      />
    );
    expect(blankAnswerMarkup).toContain("No answer submitted.");
  });
});
