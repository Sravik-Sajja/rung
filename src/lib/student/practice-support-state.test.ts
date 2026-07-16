import { describe, expect, it } from "vitest";
import { isWorkHelpEligible, type PracticeSupportEvent } from "@/lib/student/practice-support-state";

function event(kind: PracticeSupportEvent["kind"], id: string): PracticeSupportEvent {
  return { id, kind, itemId: "item-a", practiceSessionItemId: "occurrence-a" };
}

describe("work-help escalation state", () => {
  it("rejects a claim before the server has recorded the sequence", () => {
    expect(isWorkHelpEligible([], "item-a")).toBe(false);
    expect(isWorkHelpEligible([event("miss", "1")], "item-a")).toBe(false);
  });

  it("does not treat a nudge as substantive help", () => {
    expect(isWorkHelpEligible([
      event("miss", "1"),
      event("nudge", "2"),
      event("miss", "3"),
    ], "item-a")).toBe(false);
  });

  it("requires another miss after a substantive hint", () => {
    expect(isWorkHelpEligible([
      event("miss", "1"),
      event("hint", "2"),
    ], "item-a")).toBe(false);
  });

  it("does not qualify a hint that was requested before the first miss", () => {
    expect(isWorkHelpEligible([
      event("hint", "1"),
      event("miss", "2"),
    ], "item-a")).toBe(false);
  });

  it("allows exactly one claim after miss, hint, later miss", () => {
    const eligible = [event("miss", "1"), event("guided_step", "2"), event("miss", "3")];
    expect(isWorkHelpEligible(eligible, "item-a")).toBe(true);
    expect(isWorkHelpEligible([...eligible, event("work_help_claimed", "4")], "item-a")).toBe(false);
  });

  it("does not reopen the flow after a correct response", () => {
    expect(isWorkHelpEligible([
      event("miss", "1"),
      event("hint", "2"),
      event("miss", "3"),
      event("correct", "4"),
    ], "item-a")).toBe(false);
  });
});
