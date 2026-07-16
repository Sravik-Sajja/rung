/**
 * Deterministic, server-owned state rules for the "Still stuck? Show your
 * work" escalation. Both the demo store and the persisted-event migration
 * use this ordering: a wrong answer, a substantive hint, then another wrong
 * answer. A nudge is deliberately not substantive support.
 */
export type PracticeSupportEventKind =
  | "miss"
  | "correct"
  | "nudge"
  | "hint"
  | "guided_step"
  | "work_help_claimed";

export type PracticeSupportEvent = {
  id: string;
  itemId: string;
  practiceSessionItemId: string;
  kind: PracticeSupportEventKind;
};

function eventsForItem(events: readonly PracticeSupportEvent[], itemId: string) {
  return events.filter((event) => event.itemId === itemId);
}

function lastIndex(events: readonly PracticeSupportEvent[], predicate: (event: PracticeSupportEvent) => boolean) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) return index;
  }
  return -1;
}

/**
 * Returns true only for the exact server-recorded escalation sequence. The
 * claim is logical-item scoped (rather than occurrence scoped): resurfacing
 * creates a new occurrence, but it is still the same math problem.
 */
export function isWorkHelpEligible(events: readonly PracticeSupportEvent[], itemId: string) {
  const itemEvents = eventsForItem(events, itemId);
  const lastCorrect = lastIndex(itemEvents, (event) => event.kind === "correct");
  const lastMiss = lastIndex(itemEvents, (event) => event.kind === "miss");
  const lastSubstantiveHint = lastIndex(
    itemEvents,
    (event) => event.kind === "hint" || event.kind === "guided_step",
  );
  const claim = lastIndex(itemEvents, (event) => event.kind === "work_help_claimed");
  const hasMissBeforeSubstantiveHint = itemEvents.some(
    (event, index) => event.kind === "miss" && index < lastSubstantiveHint,
  );

  return lastMiss > lastSubstantiveHint
    && lastSubstantiveHint >= 0
    && hasMissBeforeSubstantiveHint
    && claim < 0
    && lastCorrect < lastMiss;
}

/** A correct response ends the work-help flow for this logical item. */
export function hasWorkHelpClaim(events: readonly PracticeSupportEvent[], itemId: string) {
  return lastIndex(eventsForItem(events, itemId), (event) => event.kind === "work_help_claimed") >= 0;
}
